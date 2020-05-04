/* eslint-disable no-param-reassign */
import { readdirSync, statSync, createReadStream } from 'fs';
import { join } from 'path';
import { URL } from 'url';
import slash from 'slash';
import progress from 'progress-stream';
import retry from 'async-retry';
import fetch from 'node-fetch';
import pLimit from 'p-limit';

import { createTask, setTitle, getDuration } from '../lib/tasks';
import { baseStorybookUrl, progress as progressBar } from '../lib/utils';
import { CHROMATIC_RETRIES } from '../constants';

const TesterGetUploadUrlsMutation = `
  mutation TesterGetUploadUrlsMutation($paths: [String!]!) {
    getUploadUrls(paths: $paths) {
      domain
      urls {
        path
        url
        contentType
      }
    }
  }
`;

// Get all paths in rootDir, starting at dirname.
// We don't want the paths to include rootDir -- so if rootDir = storybook-static,
// paths will be like iframe.html rather than storybook-static/iframe.html
function getPathsInDir(rootDir, dirname = '.') {
  return readdirSync(join(rootDir, dirname))
    .map(p => join(dirname, p))
    .map(pathname => {
      const stats = statSync(join(rootDir, pathname));
      if (stats.isDirectory()) {
        return getPathsInDir(rootDir, pathname);
      }
      return [{ pathname, contentLength: stats.size }];
    })
    .reduce((a, b) => [...a, ...b], []); // flatten
}

const uploadFiles = async (ctx, task) => {
  const { client, log, sourceDir } = ctx;

  const pathAndLengths = getPathsInDir(sourceDir).map(o => ({
    ...o,
    knownAs: slash(o.pathname),
  }));
  const paths = pathAndLengths.map(({ knownAs }) => knownAs);
  const total = pathAndLengths.map(({ contentLength }) => contentLength).reduce((a, b) => a + b, 0);
  let totalProgress = 0;

  task.output = `Retrieving target location`;

  const { getUploadUrls } = await client.runQuery(TesterGetUploadUrlsMutation, { paths });
  const { domain, urls } = getUploadUrls;

  task.output = `Starting upload`;

  const limitConcurrency = pLimit(10);
  await Promise.all(
    urls.map(({ path, url, contentType }) => {
      const pathWithDirname = join(sourceDir, path);
      log.debug(`uploading '${pathWithDirname}' to '${url}' with content type '${contentType}'`);

      let urlProgress = 0; // The bytes uploaded for this this particular URL
      const { contentLength } = pathAndLengths.find(({ knownAs }) => knownAs === path);

      return limitConcurrency(() =>
        retry(
          async () => {
            const progressStream = progress();
            progressStream.on('progress', ({ delta }) => {
              urlProgress += delta; // We upload multiple files so we only care about the delta
              totalProgress += delta;
              const percentage = Math.round((totalProgress / total) * 100);
              task.output = `[${progressBar(percentage)}] ${percentage}%`;
            });

            const res = await fetch(url, {
              method: 'PUT',
              body: createReadStream(pathWithDirname).pipe(progressStream),
              headers: {
                'content-type': contentType,
                'content-length': contentLength,
                'cache-control': 'max-age=31536000',
              },
            });

            if (!res.ok) {
              log.debug(`Uploading '${path}' failed: %O`, res);
              throw new Error(`Failed to upload ${path}`);
            }
            log.debug(`Uploaded '${path}'.`);
          },
          {
            retries: CHROMATIC_RETRIES,
            onRetry: err => {
              totalProgress -= urlProgress;
              urlProgress = 0;
              log.debug('Retrying upload %s, %O', url, err);
              const percentage = Math.round((totalProgress / total) * 100);
              task.output = `[${progressBar(percentage)}] ${percentage}%`;
            },
          }
        )
      );
    })
  );

  ctx.uploadedBytes = total;
  ctx.isolatorUrl = new URL('/iframe.html', domain).toString();
};

export default createTask({
  title: 'Upload your built Storybook',
  skip: ctx => {
    if (ctx.options.storybookUrl) return `Using hosted Storybook at ${ctx.options.storybookUrl}`;
    return false;
  },
  steps: [
    setTitle('Uploading your built Storybook'),
    uploadFiles,
    setTitle(
      ctx => `Upload complete in ${getDuration(ctx)}`,
      ctx => `View your Storybook at ${baseStorybookUrl(ctx.isolatorUrl)}`
    ),
  ],
});
