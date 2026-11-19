import path from 'path';

import { uploadBuild, UploadBuildContext, UploadBuildResult } from '../lib/upload';
import { throttle } from '../lib/utilities';
import { waitForSentinel } from '../lib/waitForSentinel';
import { Context, Deps, FileDesc, TaskResult } from '../types';
import buildFullyTurboSnapped from '../ui/messages/info/buildFullyTurboSnapped';
import { turboSnapBypassed } from '../ui/messages/info/turboSnapEnabled';
import deduplicationFailed from '../ui/messages/warnings/deduplicationFailed';
import { failed, finalizing, invalid, uploading } from '../ui/tasks/upload';

export interface UploadInput extends Pick<
  Context,
  | 'fileInfo'
  | 'sourceDir'
  | 'buildLogFile'
  | 'isReactNativeApp'
  | 'turboSnap'
  | 'onlyStoryFiles'
  | 'turboSnapOutcome'
> {
  announcedBuild: UploadBuildContext['announcedBuild'];
}

export type UploadOutput = UploadBuildResult;

const buildFileList = (deps: Deps, input: UploadInput, withHashes: boolean): FileDesc[] => {
  const { fileInfo, sourceDir } = input;
  const lengthsByPath = new Map(
    fileInfo?.lengths.map(({ knownAs, contentLength }) => [knownAs, contentLength])
  );
  const files = fileInfo?.paths.map<FileDesc>((filePath) => ({
    ...(withHashes && fileInfo.hashes && { contentHash: fileInfo.hashes[filePath] }),
    contentLength: lengthsByPath.get(filePath) ?? -1,
    localPath: path.join(sourceDir, filePath),
    targetPath: filePath,
  }));

  if (!files) {
    throw new Error(invalid({ ...input, options: deps.options }).output);
  }

  return files;
};

const uploadAndWaitForSentinels = async (
  deps: Deps,
  input: UploadInput,
  files: FileDesc[]
): Promise<UploadOutput> => {
  const { log, client, http, env, options } = deps;
  const result = await uploadBuild({ ...input, log, client, http, env, options }, files, {
    onProgress: throttle(
      (progress, total) => {
        const percentage = Math.round((progress / total) * 100);
        deps.report({
          output: uploading(deps, { percentage }).output,
          progress: { progress, total, unit: 'bytes' },
        });
      },
      // Avoid spamming the logs with progress updates in non-interactive mode
      options.interactive ? 100 : env.CHROMATIC_OUTPUT_INTERVAL
    ),
    onError: (error: Error, path?: string) => {
      throw path === error.message ? new Error(failed(deps, { path }).output) : error;
    },
  });

  // A TurboSnap-skipped build uploads nothing and has no sentinels to wait for.
  if (result.skippedByTurboSnap || result.sentinelUrls.length === 0) {
    return result;
  }

  deps.report({ output: finalizing(deps).output });

  // Dedupe sentinels, ignoring query params
  const sentinels = Object.fromEntries(
    result.sentinelUrls.map((url) => {
      const { host, pathname } = new URL(url);
      return [host + pathname, { name: pathname.split('/').at(-1) || '', url }];
    })
  );

  await Promise.all(Object.values(sentinels).map((sentinel) => waitForSentinel(deps, sentinel)));

  return result;
};

// A bypassed build halts the pipeline early (kind:'partial' sets ctx.skip). The upload frame
// shows as skipped; the success message is logged here so it flushes as a free-standing block below
// the task frames (verify/snapshot never run to log them themselves). The queried skipped-build
// fields are carried on the partial output so they land on ctx.build for the action outputs, since
// verify never runs to populate them.
const skipTurboSnapped = (
  deps: Deps,
  input: UploadInput,
  output: UploadOutput
): TaskResult<UploadOutput, UploadOutput> => {
  const { ancestorBuild } = output;
  deps.log.info(turboSnapBypassed({ ancestorBuild, turboSnapOutcome: input.turboSnapOutcome }));
  deps.log.info(buildFullyTurboSnapped({ ancestorBuild }));
  return { kind: 'partial', output };
};

/**
 * Publish the built project's files to Chromatic and wait for the upload to finalize.
 *
 * @param deps Narrow set of cross-cutting dependencies the task needs.
 * @param input Per-pipeline-run input extracted from Context at the seam.
 *
 * @returns A TaskResult conveying the upload tallies, or a self-skip for `--dry-run`.
 */
export async function uploadProject(
  deps: Deps,
  input: UploadInput
): Promise<TaskResult<UploadOutput, UploadOutput>> {
  if (deps.options.dryRun) {
    return { kind: 'skip-self' };
  }

  let output: UploadOutput;
  try {
    output = await uploadAndWaitForSentinels(deps, input, buildFileList(deps, input, true));
  } catch {
    deps.log.warn(deduplicationFailed());
    // Retry without file deduplication. uploadBuild returns fresh tallies, so the failed attempt's
    // results are discarded simply by running again.
    output = await uploadAndWaitForSentinels(deps, input, buildFileList(deps, input, false));
  }

  return output.skippedByTurboSnap
    ? skipTurboSnapped(deps, input, output)
    : { kind: 'continue', output };
}

export const extractUploadInput = (ctx: Context): UploadInput => ({
  fileInfo: ctx.fileInfo,
  sourceDir: ctx.sourceDir,
  buildLogFile: ctx.buildLogFile,
  isReactNativeApp: ctx.isReactNativeApp,
  announcedBuild: ctx.announcedBuild,
  turboSnap: ctx.turboSnap,
  onlyStoryFiles: ctx.onlyStoryFiles,
  turboSnapOutcome: ctx.turboSnapOutcome,
});

export const applyUploadOutput = (ctx: Context, output: UploadOutput) => {
  ctx.sentinelUrls = output.sentinelUrls;
  ctx.uploadedBytes = output.uploadedBytes;
  ctx.uploadedFiles = output.uploadedFiles;
};

export const applyUploadPartial = (ctx: Context, output: UploadOutput) => {
  // A bypassed build halts the pipeline here, so verify never runs to populate a full build object.
  // Apply the fields we queried from the skipped build so the index.ts outputs block reads them.
  ctx.build = { ...ctx.build, ...output.skippedBuild };
  ctx.ancestorBuild = output.ancestorBuild;
};
