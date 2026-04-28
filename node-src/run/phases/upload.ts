import nodePath from 'node:path';

import type { Environment } from '../../lib/getEnvironment';
import { Logger } from '../../lib/log';
import { Ports } from '../../lib/ports';
import { uploadBuild } from '../../lib/upload';
import { throttle } from '../../lib/utilities';
import type { Context, FileDesc, Options } from '../../types';
import sentinelFileErrors from '../../ui/messages/errors/sentinelFileErrors';
import { failed, invalid, uploading } from '../../ui/tasks/upload';
import type { PreparedFileInfo, UploadedState } from '../types';

export type UploadPhasePorts = Pick<Ports, 'chromatic' | 'uploader' | 'fs'>;

export interface UploadProgressEvent {
  /** Bytes uploaded so far. */
  progress: number;
  /** Total bytes the phase expects to upload. */
  total: number;
  /** Human-readable bytes-per-second message rendered by Listr. */
  output: string;
}

export interface UploadPhaseInput {
  options: Options;
  env: Pick<Environment, 'CHROMATIC_OUTPUT_INTERVAL'>;
  isReactNativeApp?: boolean;
  /** Source directory of files to upload (effective output of the prepare phase). */
  sourceDir: string;
  fileInfo: PreparedFileInfo;
  announcedBuild: Context['announcedBuild'];
  log: Logger;
  ports: UploadPhasePorts;
  /** Throttled progress callback, used by the wrapper to push updates to Listr. */
  onProgress?: (event: UploadProgressEvent) => void;
}

export type UploadPhaseOutput = UploadedState;

/**
 * Pure orchestration of the `upload` phase. Materializes the per-file
 * descriptor list, uploads via the chromatic + uploader ports, and waits
 * on the resulting sentinel URLs before returning the totals.
 *
 * @param input Phase inputs.
 *
 * @returns The {@link UploadedState} slice with bytes/files counts and the
 * deduped sentinel URLs.
 */
export async function runUploadPhase(input: UploadPhaseInput): Promise<UploadPhaseOutput> {
  const files = input.fileInfo.paths.map<FileDesc>((filePath) => ({
    ...(input.fileInfo.hashes && { contentHash: input.fileInfo.hashes[filePath] }),
    contentLength:
      input.fileInfo.lengths.find(({ knownAs }) => knownAs === filePath)?.contentLength ?? -1,
    localPath: nodePath.join(input.sourceDir, filePath),
    targetPath: filePath,
  }));

  if (!files) {
    throw new Error(invalid(makeLegacyContext(input)).output);
  }

  const helperContext = makeLegacyContext(input);
  const onProgress = throttle(
    (progress: number, total: number) => {
      const percentage = Math.round((progress / total) * 100);
      const output = uploading(makeLegacyContext(input), { percentage }).output;
      input.onProgress?.({ progress, total, output });
      input.options.experimental_onTaskProgress?.(helperContext, {
        progress,
        total,
        unit: 'bytes',
      });
    },
    // Avoid spamming the logs with progress updates in non-interactive mode.
    input.options.interactive ? 100 : input.env.CHROMATIC_OUTPUT_INTERVAL
  );

  await uploadBuild(helperContext, files, {
    onProgress,
    onError: (error: Error, path?: string) => {
      throw path === error.message
        ? new Error(failed(makeLegacyContext(input), { path }).output)
        : error;
    },
  });

  const sentinelUrls = helperContext.sentinelUrls ?? [];
  await waitForSentinels(input, sentinelUrls);

  return {
    uploadedBytes: helperContext.uploadedBytes ?? 0,
    uploadedFiles: helperContext.uploadedFiles ?? 0,
    sentinelUrls,
  };
}

async function waitForSentinels(input: UploadPhaseInput, urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  const sentinels = Object.fromEntries(
    urls.map((url) => {
      const { host, pathname } = new URL(url);
      return [host + pathname, { name: pathname.split('/').at(-1) || '', url }];
    })
  );
  try {
    await Promise.all(
      Object.values(sentinels).map((sentinel) =>
        input.ports.uploader.waitForSentinel(sentinel, {
          signal: input.options.experimental_abortSignal,
        })
      )
    );
  } catch (error) {
    input.log.error(sentinelFileErrors());
    throw error;
  }
}

/**
 * Synthesize a Context-shaped argument for the legacy `uploadBuild` helper.
 * The helper still expects a `Context` for `setExitCode`, ports, log, and
 * mutates `sentinelUrls` / `uploadedBytes` / `uploadedFiles` on it; the
 * phase reads those mutations off the synthesized context after the call.
 *
 * @param input Phase inputs.
 *
 * @returns A Context-shaped value carrying the fields the helper reads.
 */
function makeLegacyContext(input: UploadPhaseInput): Context {
  return {
    log: input.log,
    options: input.options,
    env: input.env,
    sourceDir: input.sourceDir,
    fileInfo: input.fileInfo,
    announcedBuild: input.announcedBuild,
    isReactNativeApp: input.isReactNativeApp,
    ports: input.ports,
  } as unknown as Context;
}
