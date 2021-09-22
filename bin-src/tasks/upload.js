/* eslint-disable no-param-reassign */
import fs from 'fs-extra';
import { join } from 'path';
import slash from 'slash';
import { URL } from 'url';

import { getDependentStoryFiles } from '../lib/getDependentStoryFiles';
import { createTask, transitionTo } from '../lib/tasks';
import uploadFiles from '../lib/uploadFiles';
import deviatingOutputDir from '../ui/messages/warnings/deviatingOutputDir';
import noStatsFile from '../ui/messages/warnings/noStatsFile';
import {
  failed,
  initial,
  skipped,
  validating,
  invalid,
  preparing,
  tracing,
  traced,
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
function getPathsInDir(ctx, rootDir, dirname = '.') {
  try {
    return fs
      .readdirSync(join(rootDir, dirname))
      .map((p) => join(dirname, p))
      .map((pathname) => {
        const stats = fs.statSync(join(rootDir, pathname));
        if (stats.isDirectory()) {
          return getPathsInDir(ctx, rootDir, pathname);
        }
        return [{ pathname, contentLength: stats.size }];
      })
      .reduce((a, b) => [...a, ...b], []); // flatten
  } catch (e) {
    ctx.log.debug(e);
    throw new Error(invalid({ sourceDir: rootDir }, e).output);
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

function getFileInfo(ctx, sourceDir) {
  const lengths = getPathsInDir(ctx, sourceDir).map((o) => ({ ...o, knownAs: slash(o.pathname) }));
  const total = lengths.map(({ contentLength }) => contentLength).reduce((a, b) => a + b, 0);
  const paths = [];
  let statsPath;
  // eslint-disable-next-line no-restricted-syntax
  for (const { knownAs } of lengths) {
    if (knownAs.endsWith('preview-stats.json')) statsPath = knownAs;
    else if (!knownAs.endsWith('manager-stats.json')) paths.push(knownAs);
  }
  return { lengths, paths, statsPath, total };
}

const isValidStorybook = ({ paths, total }) =>
  total > 0 && paths.includes('iframe.html') && paths.includes('index.html');

export const validateFiles = async (ctx, task) => {
  ctx.fileInfo = getFileInfo(ctx, ctx.sourceDir);

  if (!isValidStorybook(ctx.fileInfo) && ctx.buildLogFile) {
    try {
      const buildLog = fs.readFileSync(ctx.buildLogFile, 'utf8');
      const outputDir = getOutputDir(buildLog);
      if (outputDir && outputDir !== ctx.sourceDir) {
        ctx.log.warn(deviatingOutputDir(ctx, outputDir));
        ctx.sourceDir = outputDir;
        ctx.fileInfo = getFileInfo(ctx, ctx.sourceDir);
      }
    } catch (e) {
      ctx.log.debug(e);
    }
  }

  if (!isValidStorybook(ctx.fileInfo)) {
    throw new Error(invalid(ctx).output);
  }
};

export const traceChangedFiles = async (ctx, task) => {
  if (!ctx.git.changedFiles) return;
  if (!ctx.fileInfo.statsPath) {
    ctx.log.warn(noStatsFile());
    return;
  }

  transitionTo(tracing)(ctx, task);

  const statsPath = join(ctx.sourceDir, ctx.fileInfo.statsPath);
  const { changedFiles } = ctx.git;
  try {
    const stats = await fs.readJson(statsPath);
    ctx.onlyStoryFiles = await getDependentStoryFiles(ctx, stats, changedFiles);
    ctx.log.debug(
      `Found affected story files:\n${Object.entries(ctx.onlyStoryFiles)
        .map(([id, f]) => `  ${f} [${id}]`)
        .join('\n')}`
    );
    transitionTo(traced)(ctx, task);
  } catch (e) {
    ctx.log.warn('Failed to retrieve dependent story files', { statsPath, changedFiles });
  }
};

export const uploadStorybook = async (ctx, task) => {
  if (ctx.skip) return;
  transitionTo(preparing)(ctx, task);

  const { lengths, paths, total } = ctx.fileInfo;
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
    await uploadFiles(ctx, files, (progress) => {
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
  transitionTo(success, true)(ctx, task);
};

export default createTask({
  title: initial.title,
  skip: (ctx) => {
    if (ctx.skip) return true;
    if (ctx.options.storybookUrl) return skipped(ctx).output;
    return false;
  },
  steps: [transitionTo(validating), validateFiles, traceChangedFiles, uploadStorybook],
});
