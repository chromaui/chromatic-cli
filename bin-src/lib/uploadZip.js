import retry from 'async-retry';
import fs from 'fs-extra';
import progress from 'progress-stream';

// A sentinel file is created by a zip-unpack lambda within the Chromatic infrastructure once the
// uploaded zip is fully extracted. The contents of this file will consist of 'OK' if the process
// completed successfully and 'ERROR' if an error occurred.
const SENTINEL_SUCCESS_VALUE = 'OK';

export async function uploadZip(ctx, path, url, contentLength, onProgress) {
  let totalProgress = 0;

  ctx.log.debug(`Uploading ${contentLength} bytes for '${path}' to '${url}'`);

  return retry(
    async () => {
      const progressStream = progress();

      progressStream.on('progress', ({ delta }) => {
        totalProgress += delta;
        onProgress(totalProgress);
      });

      const res = await ctx.http.fetch(
        url,
        {
          method: 'PUT',
          body: fs.createReadStream(path).pipe(progressStream),
          headers: {
            'content-type': 'application/zip',
            'content-length': contentLength,
          },
        },
        { retries: 0 } // already retrying the whole operation
      );

      if (!res.ok) {
        ctx.log.debug(`Uploading '${path}' failed: %O`, res);
        throw new Error(path);
      }
      ctx.log.debug(`Uploaded '${path}'.`);
    },
    {
      retries: ctx.env.CHROMATIC_RETRIES,
      onRetry: (err) => {
        totalProgress = 0;
        ctx.log.debug('Retrying upload %s, %O', url, err);
        onProgress(totalProgress);
      },
    }
  );
}

export async function waitForUnpack(ctx, url) {
  ctx.log.debug(`Waiting for zip unpack sentinel file to appear at '${url}'`);

  return retry(
    async (bail) => {
      let res;
      try {
        res = await ctx.http.fetch(url, {}, { retries: 0, noLogErrorBody: true });
      } catch (e) {
        const { response = {} } = e;
        if (response.status === 403) {
          bail(new Error('Provided signature expired.'));
        }
        throw new Error('Sentinel file not present.');
      }

      const result = await res.text();
      if (result !== SENTINEL_SUCCESS_VALUE) {
        bail(new Error('Zip file failed to unpack remotely.'));
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
