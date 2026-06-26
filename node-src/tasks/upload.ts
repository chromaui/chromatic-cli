import path from 'path';

import { uploadBuild } from '../lib/upload';
import { throttle } from '../lib/utilities';
import { waitForSentinel } from '../lib/waitForSentinel';
import { Context, Deps, FileDesc, TaskResult } from '../types';
import buildTurboSkipped from '../ui/messages/info/buildFullyTurboSnapped';
import deduplicationFailed from '../ui/messages/warnings/deduplicationFailed';
import { failed, finalizing, invalid, uploading } from '../ui/tasks/upload';

export interface UploadInput {
  // `uploadBuild`, `waitForSentinel`, and `buildFileList` all reach deep into Context, and that
  // subtree (uploadFiles/uploadZip/compress) is too large to refactor proportionately. So we thread
  // the live Context through `input` Refactoring this library to not rely on Context is a larger project.
  uploadContext: Context;
}

export interface UploadOutput {
  sentinelUrls: string[];
  uploadedBytes: number;
  uploadedFiles: number;
  skippedByTurboSnap?: boolean;
}

const buildFileList = (ctx: Context, withHashes: boolean): FileDesc[] => {
  const files = ctx.fileInfo?.paths.map<FileDesc>((filePath) => ({
    ...(withHashes && ctx.fileInfo?.hashes && { contentHash: ctx.fileInfo.hashes[filePath] }),
    contentLength:
      ctx.fileInfo?.lengths.find(({ knownAs }) => knownAs === filePath)?.contentLength ?? -1,
    localPath: path.join(ctx.sourceDir, filePath),
    targetPath: filePath,
  }));

  if (!files) {
    throw new Error(invalid(ctx).output);
  }

  return files;
};

const uploadAndWaitForSentinels = async (
  deps: Deps,
  ctx: Context,
  files: FileDesc[]
): Promise<UploadOutput> => {
  const { sentinelUrls, uploadedBytes, uploadedFiles, skippedByTurboSnap } = await uploadBuild(
    ctx,
    files,
    {
      onProgress: throttle(
        (progress, total) => {
          const percentage = Math.round((progress / total) * 100);
          deps.report({
            output: uploading(ctx, { percentage }).output,
            progress: { progress, total, unit: 'bytes' },
          });
        },
        // Avoid spamming the logs with progress updates in non-interactive mode
        ctx.options.interactive ? 100 : ctx.env.CHROMATIC_OUTPUT_INTERVAL
      ),
      onError: (error: Error, path?: string) => {
        throw path === error.message ? new Error(failed(ctx, { path }).output) : error;
      },
    }
  );

  // A TurboSnap-skipped build uploads nothing and has no sentinels to wait for.
  if (skippedByTurboSnap || sentinelUrls.length === 0) {
    return { sentinelUrls, uploadedBytes, uploadedFiles, skippedByTurboSnap };
  }

  deps.report({ output: finalizing(ctx).output });

  // Dedupe sentinels, ignoring query params
  const sentinels = Object.fromEntries(
    sentinelUrls.map((url) => {
      const { host, pathname } = new URL(url);
      return [host + pathname, { name: pathname.split('/').at(-1) || '', url }];
    })
  );

  await Promise.all(Object.values(sentinels).map((sentinel) => waitForSentinel(ctx, sentinel)));

  return { sentinelUrls, uploadedBytes, uploadedFiles };
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
): Promise<TaskResult<UploadOutput>> {
  const ctx = input.uploadContext;

  if (ctx.options.dryRun) {
    return { kind: 'skip-self' };
  }

  try {
    const output = await uploadAndWaitForSentinels(deps, ctx, buildFileList(ctx, true));
    if (output.skippedByTurboSnap) {
      return { kind: 'skip', reason: buildTurboSkipped() };
    }
    return { kind: 'continue', output };
  } catch {
    deps.log.warn(deduplicationFailed());
    // Retry without file deduplication. uploadBuild returns fresh tallies, so the failed attempt's
    // results are discarded simply by running again.
    const output = await uploadAndWaitForSentinels(deps, ctx, buildFileList(ctx, false));
    if (output.skippedByTurboSnap) {
      return { kind: 'skip', reason: buildTurboSkipped() };
    }
    return { kind: 'continue', output };
  }
}

export const extractUploadInput = (ctx: Context): UploadInput => ({ uploadContext: ctx });

export const applyUploadOutput = (ctx: Context, output: UploadOutput) => {
  ctx.sentinelUrls = output.sentinelUrls;
  ctx.uploadedBytes = output.uploadedBytes;
  ctx.uploadedFiles = output.uploadedFiles;
};
