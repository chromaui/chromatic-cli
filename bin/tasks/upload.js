/* eslint-disable no-param-reassign */
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { URL } from 'url';
import slash from 'slash';

import { createTask, transitionTo } from '../lib/tasks';

import uploadFiles from '../lib/uploadFiles';
import {
  initial,
  preparing,
  starting,
  uploading,
  success,
  skipped,
  failed,
} from '../ui/tasks/upload';

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

export const uploadStorybook = async (ctx, task) => {
  const { client, sourceDir } = ctx;

  const pathAndLengths = getPathsInDir(sourceDir).map(o => ({ ...o, knownAs: slash(o.pathname) }));
  const paths = pathAndLengths.map(({ knownAs }) => knownAs);
  const total = pathAndLengths.map(({ contentLength }) => contentLength).reduce((a, b) => a + b, 0);

  task.output = preparing(ctx).output;

  const { getUploadUrls } = await client.runQuery(TesterGetUploadUrlsMutation, { paths });
  const { domain, urls } = getUploadUrls;
  const files = urls.map(({ path, url, contentType }) => ({
    path: join(sourceDir, path),
    url,
    contentType,
    contentLength: pathAndLengths.find(({ knownAs }) => knownAs === path).contentLength,
  }));

  task.output = starting(ctx).output;

  try {
    await uploadFiles(ctx, files, progress => {
      if (ctx.options.interactive) {
        const percentage = Math.round((progress / total) * 100);
        task.output = uploading({ percentage }).output;
      }
    });
  } catch (e) {
    if (files.find(({ path }) => path === e.message)) {
      throw new Error(failed({ path: e.message }).output);
    }
    throw e;
  }

  ctx.uploadedBytes = total;
  ctx.isolatorUrl = new URL('/iframe.html', domain).toString();
};

export default createTask({
  title: initial.title,
  skip: ctx => {
    if (ctx.options.storybookUrl) return skipped(ctx).output;
    return false;
  },
  steps: [transitionTo(preparing), uploadStorybook, transitionTo(success, true)],
});
