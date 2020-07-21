/* eslint-disable no-param-reassign */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import slash from 'slash';
import { URL } from 'url';

import { createTask, transitionTo } from '../lib/tasks';
import uploadFiles from '../lib/uploadFiles';
import deviatingOutputDir from '../ui/messages/warnings/deviatingOutputDir';
import {
  failed,
  initial,
  invalid,
  preparing,
  skipped,
  starting,
  success,
  uploading,
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
  try {
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
  } catch (e) {
    throw new Error(invalid({ sourceDir: rootDir }).output);
  }
}

function getOutputDir(buildLog) {
  const outputString = 'Output directory: ';
  const outputIndex = buildLog.lastIndexOf(outputString);
  if (outputIndex === -1) return undefined;
  const remainingLog = buildLog.substr(outputIndex + outputString.length);
  const newlineIndex = remainingLog.indexOf('\n');
  const outputDir = newlineIndex === -1 ? remainingLog : remainingLog.substr(0, newlineIndex);
  return outputDir.trim();
}

function getFileInfo(sourceDir) {
  const lengths = getPathsInDir(sourceDir).map(o => ({ ...o, knownAs: slash(o.pathname) }));
  const paths = lengths.map(({ knownAs }) => knownAs);
  const total = lengths.map(({ contentLength }) => contentLength).reduce((a, b) => a + b, 0);
  return { lengths, paths, total };
}

const isValidStorybook = ({ paths, total }) =>
  total > 0 && paths.includes('iframe.html') && paths.includes('index.html');

export const uploadStorybook = async (ctx, task) => {
  let fileInfo = getFileInfo(ctx.sourceDir);

  if (!isValidStorybook(fileInfo) && ctx.buildLogFile) {
    try {
      const buildLog = readFileSync(ctx.buildLogFile, 'utf8');
      const outputDir = getOutputDir(buildLog);
      if (outputDir && outputDir !== ctx.sourceDir) {
        ctx.log.warn(deviatingOutputDir(ctx, outputDir));
        ctx.sourceDir = outputDir;
        fileInfo = getFileInfo(ctx.sourceDir);
      }
    } catch (e) {
      ctx.log.debug(e);
    }
  }

  if (!isValidStorybook(fileInfo)) {
    throw new Error(invalid(ctx).output);
  }

  task.output = preparing(ctx).output;

  const { lengths, paths, total } = fileInfo;
  const { getUploadUrls } = await ctx.client.runQuery(TesterGetUploadUrlsMutation, { paths });
  const { domain, urls } = getUploadUrls;
  const files = urls.map(({ path, url, contentType }) => ({
    path: join(ctx.sourceDir, path),
    url,
    contentType,
    contentLength: lengths.find(({ knownAs }) => knownAs === path).contentLength,
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
    if (ctx.skip) return true;
    if (ctx.options.storybookUrl) return skipped(ctx).output;
    return false;
  },
  steps: [transitionTo(preparing), uploadStorybook, transitionTo(success, true)],
});
