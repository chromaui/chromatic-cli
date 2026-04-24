import { Context, TargetInfo } from '../types';

/**
 * Upload a zip to Chromatic instead of individual files.
 *
 * @param ctx The context set when executing the CLI.
 * @param target The zip information to upload.
 * @param onProgress A callback to report progress on the upload.
 *
 * @returns A promise that resolves when the zip is uploaded.
 */
export async function uploadZip(
  ctx: Context,
  target: TargetInfo & { contentLength: number; localPath: string },
  onProgress: (progress: number) => void
) {
  const { experimental_abortSignal: signal } = ctx.options;
  let totalProgress = 0;

  await ctx.ports.uploader.uploadFile(target, {
    signal,
    retries: ctx.env.CHROMATIC_RETRIES,
    onProgress: (delta) => {
      totalProgress += delta;
      onProgress(totalProgress);
    },
  });
}
