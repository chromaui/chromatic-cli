import setupDebug from 'debug';
import { readdirSync, statSync, createReadStream } from 'fs';
import { join } from 'path';
import { URL } from 'url';
import progress from 'progress-stream';
import ProgressBar from 'progress';

import HTTPClient from './HTTPClient';

import { CHROMATIC_RETRIES } from '../constants';

const debug = setupDebug('chromatic-cli:upload');

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

export async function uploadToS3(source, client) {
  debug(`uploading '${source}' to s3`);

  const pathAndLengths = getPathsInDir(source);

  const {
    getUploadUrls: { domain, urls },
  } = await client.runQuery(TesterGetUploadUrlsMutation, {
    paths: pathAndLengths.map(({ pathname }) => pathname),
  });

  const total =
    pathAndLengths.map(({ contentLength }) => contentLength).reduce((a, b) => a + b, 0) / 1000;
  const bar = new ProgressBar('uploading [:bar] :ratekb/s :percent :etas', { width: 20, total });

  const uploads = [];
  urls.forEach(({ path, url, contentType }) => {
    const pathWithDirname = join(source, path);
    debug(`uploading '${pathWithDirname}' to '${url}' with content type '${contentType}'`);

    const progressStream = progress();
    progressStream.on('progress', ({ delta }) => bar.tick(delta / 1000));
    const { contentLength } = pathAndLengths.find(({ pathname }) => pathname === path);
    uploads.push(
      (async () => {
        const res = await HTTPClient.fetch(
          url,
          {
            method: 'PUT',
            body: createReadStream(pathWithDirname).pipe(progressStream),
            headers: {
              'content-type': contentType,
              'content-length': contentLength,
            },
          },
          { retries: CHROMATIC_RETRIES }
        );

        if (!res.ok) {
          debug(`Uploading '${path}' failed: %O`, res);
          throw new Error(`Failed to upload ${path}`);
        }
      })()
    );
  });

  await Promise.all(uploads);

  // NOTE: Storybook-specific
  return new URL('/iframe.html', domain).toString();
}
