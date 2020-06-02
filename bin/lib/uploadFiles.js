import retry from 'async-retry';
import fs from 'fs';
import fetch from 'node-fetch';
import pLimit from 'p-limit';
import progress from 'progress-stream';

export default async function uploadFiles({ env, log }, files, onProgress) {
  const limitConcurrency = pLimit(10);
  let totalProgress = 0;

  await Promise.all(
    files.map(({ path, url, contentType, contentLength }) => {
      let fileProgress = 0; // The bytes uploaded for this this particular file

      log.debug(`Uploading ${contentLength} bytes of ${contentType} for '${path}' to '${url}'`);

      return limitConcurrency(() =>
        retry(
          async () => {
            const progressStream = progress();

            progressStream.on('progress', ({ delta }) => {
              fileProgress += delta; // We upload multiple files so we only care about the delta
              totalProgress += delta;
              onProgress(totalProgress);
            });

            const res = await fetch(url, {
              method: 'PUT',
              body: fs.createReadStream(path).pipe(progressStream),
              headers: {
                'content-type': contentType,
                'content-length': contentLength,
                'cache-control': 'max-age=31536000',
              },
            });

            if (!res.ok) {
              log.debug(`Uploading '${path}' failed: %O`, res);
              throw new Error(path);
            }
            log.debug(`Uploaded '${path}'.`);
          },
          {
            retries: env.CHROMATIC_RETRIES,
            onRetry: err => {
              totalProgress -= fileProgress;
              fileProgress = 0;
              log.debug('Retrying upload %s, %O', url, err);
              onProgress(totalProgress);
            },
          }
        )
      );
    })
  );
}
