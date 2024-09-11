import retry from 'async-retry';
import { filesize } from 'filesize';
import { FormData } from 'formdata-node';
import pLimit from 'p-limit';

import { Context, FileDesc, TargetInfo } from '../types';
import { FileReaderBlob } from './FileReaderBlob';

export async function uploadFiles(
  ctx: Context,
  targets: (FileDesc & TargetInfo)[],
  onProgress?: (progress: number) => void
) {
  const { experimental_abortSignal: signal } = ctx.options;
  const limitConcurrency = pLimit(10);
  let totalProgress = 0;

  await Promise.all(
    targets.map(({ contentLength, filePath, formAction, formFields, localPath }) => {
      let fileProgress = 0; // The bytes uploaded for this this particular file

      ctx.log.debug(`Uploading ${filePath} (${filesize(contentLength)}) to ${formAction}`);

      return limitConcurrency(() =>
        retry(
          async (bail) => {
            if (signal?.aborted) {
              return bail(signal.reason || new Error('Aborted'));
            }

            const blob = new FileReaderBlob(localPath, contentLength, (delta) => {
              fileProgress += delta;
              totalProgress += delta;
              onProgress?.(totalProgress);
            });

            const formData = new FormData();
            Object.entries(formFields).forEach(([k, v]) => formData.append(k, v));
            formData.append('file', blob);

            try {
              await ctx.http.fetch(
                formAction,
                { body: formData, method: 'POST', signal },
                { retries: 0 } // already retrying the whole operation
              );
              ctx.log.debug(`Uploaded ${filePath} (${filesize(contentLength)})`);
            } catch {
              throw new Error(localPath);
            }
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
