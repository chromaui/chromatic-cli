/* eslint-disable no-param-reassign */
import fs from 'fs-extra';
import { join } from 'path';
import slash from 'slash';
import { URL } from 'url';

import { getDependentStoryFiles } from '../lib/getDependentStoryFiles';
import { createTask, transitionTo } from '../lib/tasks';
import makeZipFile from '../lib/compress';
import uploadFiles from '../lib/uploadFiles';
import { rewriteErrorMessage } from '../lib/utils';
import { uploadZip, waitForUnpack } from '../lib/uploadZip';
import deviatingOutputDir from '../ui/messages/warnings/deviatingOutputDir';
import missingStatsFile from '../ui/messages/warnings/missingStatsFile';
import {
  failed,
  initial,
  dryRun,
  skipped,
  validating,
  invalid,
  preparing,
  tracing,
  bailed,
  traced,
  starting,
  uploading,
  success,
} from '../ui/tasks/upload';
import { Context, Task } from '../types';
import { readStatsFile } from './read-stats-file';
import bailFile from '../ui/messages/warnings/bailFile';
import { findChangedPackageFiles } from '../lib/findChangedPackageFiles';
import { findChangedDependencies } from '../lib/findChangedDependencies';

const GetUploadUrlsMutation = `
  mutation GetUploadUrlsMutation($paths: [String!]!) {
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
interface GetUploadUrlsMutationResult {
  getUploadUrls: {
    domain: string;
    urls: {
      path: string;
      url: string;
      contentType: string;
    }[];
  };
}

const GetZipUploadUrlMutation = `
  mutation GetZipUploadUrlMutation {
    getZipUploadUrl {
      domain
      url
      sentinelUrl
    }
  }
`;
interface GetZipUploadUrlMutationResult {
  getZipUploadUrl: {
    domain: string;
    url: string;
    sentinelUrl: string;
  };
}

interface PathSpec {
  pathname: string;
  contentLength: number;
}

// Get all paths in rootDir, starting at dirname.
// We don't want the paths to include rootDir -- so if rootDir = storybook-static,
// paths will be like iframe.html rather than storybook-static/iframe.html
function getPathsInDir(ctx: Context, rootDir: string, dirname = '.'): PathSpec[] {
  try {
    return fs.readdirSync(join(rootDir, dirname)).flatMap((p: string) => {
      const pathname = join(dirname, p);
      const stats = fs.statSync(join(rootDir, pathname));
      return stats.isDirectory()
        ? getPathsInDir(ctx, rootDir, pathname)
        : [{ pathname, contentLength: stats.size }];
    });
  } catch (e) {
    ctx.log.debug(e);
    throw new Error(invalid({ sourceDir: rootDir } as any, e).output);
  }
}

function getOutputDir(buildLog: string) {
  const outputString = 'Output directory: ';
  const outputIndex = buildLog.lastIndexOf(outputString);
  if (outputIndex === -1) return undefined;
  const remainingLog = buildLog.slice(outputIndex + outputString.length);
  const newlineIndex = remainingLog.indexOf('\n');
  const outputDir = newlineIndex === -1 ? remainingLog : remainingLog.slice(0, newlineIndex);
  return outputDir.trim();
}

function getFileInfo(ctx: Context, sourceDir: string) {
  const lengths = getPathsInDir(ctx, sourceDir).map((o) => ({ ...o, knownAs: slash(o.pathname) }));
  const total = lengths.map(({ contentLength }) => contentLength).reduce((a, b) => a + b, 0);
  const paths: string[] = [];
  let statsPath: string;
  // eslint-disable-next-line no-restricted-syntax
  for (const { knownAs } of lengths) {
    if (knownAs.endsWith('preview-stats.json')) statsPath = knownAs;
    else if (!knownAs.endsWith('manager-stats.json')) paths.push(knownAs);
  }
  return { lengths, paths, statsPath, total };
}

const isValidStorybook = ({ paths, total }) =>
  total > 0 && paths.includes('iframe.html') && paths.includes('index.html');

export const validateFiles = async (ctx: Context) => {
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

export const traceChangedFiles = async (ctx: Context, task: Task) => {
  if (!ctx.git.changedFiles) return;
  if (!ctx.fileInfo.statsPath) {
    ctx.turboSnap.bailReason = { missingStatsFile: true };
    ctx.log.warn(missingStatsFile());
    return;
  }

  transitionTo(tracing)(ctx, task);

  const statsPath = join(ctx.sourceDir, ctx.fileInfo.statsPath);
  const { baselineCommits, changedFiles, packageManifestChanges } = ctx.git;
  try {
    const changedDependencyNames = await findChangedDependencies(baselineCommits).catch((e) => {
      ctx.log.debug(e);
    });
    if (!changedDependencyNames) {
      ctx.log.warn(`Could not retrieve dependency changes from lockfiles; checking package.json`);
      const changedPackageFiles = await findChangedPackageFiles(packageManifestChanges);
      if (changedPackageFiles.length > 0) {
        ctx.turboSnap.bailReason = { changedPackageFiles };
        ctx.log.warn(bailFile({ turboSnap: ctx.turboSnap }));
        return;
      }
    }
    const stats = await readStatsFile(statsPath);
    const onlyStoryFiles = await getDependentStoryFiles(
      ctx,
      stats,
      statsPath,
      changedFiles,
      changedDependencyNames || []
    );
    if (onlyStoryFiles) {
      ctx.onlyStoryFiles = Object.keys(onlyStoryFiles);
      if (!ctx.options.interactive) {
        if (!ctx.options.traceChanged) {
          ctx.log.info(
            `Found affected story files:\n${Object.entries(onlyStoryFiles)
              .flatMap(([id, files]) => files.map((f) => `  ${f} [${id}]`))
              .join('\n')}`
          );
        }
        if (ctx.untracedFiles && ctx.untracedFiles.length) {
          ctx.log.info(
            `Encountered ${ctx.untracedFiles.length} untraced files:\n${ctx.untracedFiles
              .map((f) => `  ${f}`)
              .join('\n')}`
          );
        }
      }
      transitionTo(traced)(ctx, task);
    } else {
      transitionTo(bailed)(ctx, task);
    }
  } catch (err) {
    if (!ctx.options.interactive) {
      ctx.log.info('Failed to retrieve dependent story files', { statsPath, changedFiles, err });
    }
    throw rewriteErrorMessage(err, `Could not retrieve dependent story files.\n${err.message}`);
  }
};

async function uploadAsIndividualFiles(ctx: Context, task: Task) {
  const { lengths, paths, total } = ctx.fileInfo;
  const { getUploadUrls } = await ctx.client.runQuery<GetUploadUrlsMutationResult>(
    GetUploadUrlsMutation,
    { paths }
  );
  const { domain, urls } = getUploadUrls;
  const files = urls.map(({ path, url, contentType }) => ({
    path: join(ctx.sourceDir, path),
    url,
    contentType,
    contentLength: lengths.find(({ knownAs }) => knownAs === path).contentLength,
  }));

  task.output = starting().output;

  try {
    await uploadFiles(ctx, files, (progress: number) => {
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
}

async function uploadAsZipFile(ctx: Context, task: Task) {
  const zipped = await makeZipFile(ctx);
  const { path, size: total } = zipped;
  const { getZipUploadUrl } = await ctx.client.runQuery<GetZipUploadUrlMutationResult>(
    GetZipUploadUrlMutation
  );
  const { domain, url, sentinelUrl } = getZipUploadUrl;

  task.output = starting().output;

  try {
    await uploadZip(ctx, path, url, total, (progress) => {
      if (ctx.options.interactive) {
        const percentage = Math.round((progress / total) * 100);
        task.output = uploading({ percentage }).output;
      }
    });
  } catch (e) {
    if (path === e.message) {
      throw new Error(failed({ path }).output);
    }
    throw e;
  }

  ctx.uploadedBytes = total;
  ctx.isolatorUrl = new URL('/iframe.html', domain).toString();

  return waitForUnpack(ctx, sentinelUrl);
}

export const uploadStorybook = async (ctx: Context, task: Task) => {
  if (ctx.skip) return;
  transitionTo(preparing)(ctx, task);

  if (ctx.options.zip) {
    try {
      await uploadAsZipFile(ctx, task);
    } catch (err) {
      ctx.log.debug({ err }, 'Error uploading zip file');
      await uploadAsIndividualFiles(ctx, task);
    }
  } else {
    await uploadAsIndividualFiles(ctx, task);
  }
};

export default createTask({
  title: initial.title,
  skip: (ctx: Context) => {
    if (ctx.skip) return true;
    if (ctx.options.dryRun) return dryRun().output;
    if (ctx.options.storybookUrl) return skipped(ctx).output;
    return false;
  },
  steps: [
    transitionTo(validating),
    validateFiles,
    traceChangedFiles,
    uploadStorybook,
    transitionTo(success, true),
  ],
});
