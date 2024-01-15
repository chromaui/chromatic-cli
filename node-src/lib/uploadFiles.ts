import retry from 'async-retry';
import { filesize } from 'filesize';
import FormData from 'form-data';
import { createReadStream } from 'fs';
import pLimit from 'p-limit';
import progress from 'progress-stream';
import { Context, FileDesc, TargetInfo } from '../types';
import skippingEmptyFiles from '../ui/messages/warnings/skippingEmptyFiles';

export async function uploadFiles(
  ctx: Context,
  targets: (FileDesc & TargetInfo)[],
  onProgress?: (progress: number) => void
) {
  const { experimental_abortSignal: signal } = ctx.options;
  const limitConcurrency = pLimit(10);
  let totalProgress = 0;

  const nonEmptyTargets = targets.filter(({ contentLength }) => contentLength > 0);
  if (nonEmptyTargets.length !== targets.length) {
    const emptyFiles = targets.filter(({ contentLength }) => contentLength === 0);
    ctx.log.warn(skippingEmptyFiles({ emptyFiles }));
  }

  await Promise.all(
    nonEmptyTargets.map(({ contentLength, filePath, formAction, formFields, localPath }) => {
      let fileProgress = 0; // The bytes uploaded for this this particular file

      ctx.log.debug(`Uploading ${filePath} (${filesize(contentLength)})`);

      return limitConcurrency(() =>
        retry(
          async (bail) => {
            if (signal?.aborted) {
              return bail(signal.reason || new Error('Aborted'));
            }

            const progressStream = progress();

            progressStream.on('progress', ({ delta }) => {
              fileProgress += delta; // We upload multiple files so we only care about the delta
              totalProgress += delta;
              onProgress?.(totalProgress);
            });

            const formData = new FormData();
            Object.entries(formFields).forEach(([k, v]) => formData.append(k, v));
            formData.append('file', createReadStream(localPath).pipe(progressStream), {
              knownLength: contentLength,
            });

            const res = await ctx.http.fetch(
              formAction,
              { body: formData, method: 'POST', signal },
              { retries: 0 } // already retrying the whole operation
            );

            if (!res.ok) {
              ctx.log.debug(`Uploading ${localPath} failed: %O`, res);
              throw new Error(localPath);
            }
            ctx.log.debug(`Uploaded ${filePath} (${filesize(contentLength)})`);
          },
          {
            retries: ctx.env.CHROMATIC_RETRIES,
            onRetry: (err: Error) => {
              totalProgress -= fileProgress;
              fileProgress = 0;
              ctx.log.debug('Retrying upload for %s, %O', localPath, err);
              onProgress?.(totalProgress);
            },
          }
        )
      );
    })
  );
}
