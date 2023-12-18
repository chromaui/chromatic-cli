import retry from 'async-retry';
import { filesize } from 'filesize';
import { FormData } from 'formdata-node';
import { Response } from 'node-fetch';
import { Context, TargetInfo } from '../types';
import { FileReaderBlob } from './FileReaderBlob';

// A sentinel file is created by a zip-unpack lambda within the Chromatic infrastructure once the
// uploaded zip is fully extracted. The contents of this file will consist of 'OK' if the process
// completed successfully and 'ERROR' if an error occurred.
const SENTINEL_SUCCESS_VALUE = 'OK';

export async function uploadZip(
  ctx: Context,
  target: TargetInfo & { contentLength: number; localPath: string; sentinelUrl: string },
  onProgress: (progress: number) => void
) {
  const { experimental_abortSignal: signal } = ctx.options;
  const { contentLength, filePath, formAction, formFields, localPath } = target;
  let totalProgress = 0;

  ctx.log.debug(`Uploading ${filePath} (${filesize(contentLength)})`);

  return retry(
    async (bail) => {
      if (signal?.aborted) {
        return bail(signal.reason || new Error('Aborted'));
      }

      const blob = new FileReaderBlob(localPath, contentLength, (delta) => {
        totalProgress += delta;
        onProgress?.(totalProgress);
      });

      const formData = new FormData();
      Object.entries(formFields).forEach(([k, v]) => formData.append(k, v));
      formData.append('file', blob);

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
        totalProgress = 0;
        ctx.log.debug('Retrying upload for %s, %O', localPath, err);
        onProgress(totalProgress);
      },
    }
  );
}

export async function waitForUnpack(ctx: Context, url: string) {
  const { experimental_abortSignal: signal } = ctx.options;

  ctx.log.debug(`Waiting for zip unpack sentinel file to appear at '${url}'`);

  return retry(
    async (bail) => {
      if (signal?.aborted) {
        return bail(signal.reason || new Error('Aborted'));
      }

      let res: Response;
      try {
        res = await ctx.http.fetch(url, { signal }, { retries: 0, noLogErrorBody: true });
      } catch (e) {
        const { response = {} } = e;
        if (response.status === 403) {
          return bail(new Error('Provided signature expired.'));
        }
        throw new Error('Sentinel file not present.');
      }

      const result = await res.text();
      if (result !== SENTINEL_SUCCESS_VALUE) {
        return bail(new Error('Zip file failed to unpack remotely.'));
      } else {
        ctx.log.debug(`Sentinel file present, continuing.`);
      }
    },
    {
      retries: 185, // 3 minutes and some change (matches the lambda timeout with some extra buffer)
      minTimeout: 1000,
      maxTimeout: 1000,
    }
  );
}
