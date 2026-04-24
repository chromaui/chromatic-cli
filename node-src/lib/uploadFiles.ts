import pLimit from 'p-limit';

import { Context, FileDesc, TargetInfo } from '../types';

/**
 * Upload Storybook build files to Chromatic.
 *
 * @param ctx The context set when executing the CLI.
 * @param targets The list of files to upload.
 * @param onProgress A callback to report progress on the upload.
 *
 * @returns A promise that resolves when all files are uploaded.
 */
export async function uploadFiles(
  ctx: Context,
  targets: (FileDesc & TargetInfo)[],
  onProgress?: (progress: number) => void
) {
  const { experimental_abortSignal: signal } = ctx.options;
  const limitConcurrency = pLimit(10);
  let totalProgress = 0;

  await Promise.all(
    targets.map((target) =>
      limitConcurrency(() =>
        ctx.ports.uploader.uploadFile(target, {
          signal,
          retries: ctx.env.CHROMATIC_RETRIES,
          onProgress: (delta) => {
            totalProgress += delta;
            onProgress?.(totalProgress);
          },
        })
      )
    )
  );
}
