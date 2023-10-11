import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import slash from 'slash';

import { getDependentStoryFiles } from '../lib/getDependentStoryFiles';
import { createTask, transitionTo } from '../lib/tasks';
import { rewriteErrorMessage, throttle } from '../lib/utils';
import deviatingOutputDir from '../ui/messages/warnings/deviatingOutputDir';
import missingStatsFile from '../ui/messages/warnings/missingStatsFile';
import {
  failed,
  initial,
  dryRun,
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
import { uploadAsIndividualFiles, uploadAsZipFile } from '../lib/upload';

interface PathSpec {
  pathname: string;
  contentLength: number;
}

// Get all paths in rootDir, starting at dirname.
// We don't want the paths to include rootDir -- so if rootDir = storybook-static,
// paths will be like iframe.html rather than storybook-static/iframe.html
function getPathsInDir(ctx: Context, rootDir: string, dirname = '.'): PathSpec[] {
  try {
    return readdirSync(join(rootDir, dirname)).flatMap((p: string) => {
      const pathname = join(dirname, p);
      const stats = statSync(join(rootDir, pathname));
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
      const buildLog = readFileSync(ctx.buildLogFile, 'utf8');
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
  if (!ctx.turboSnap || ctx.turboSnap.unavailable) return;
  if (!ctx.git.changedFiles) return;
  if (!ctx.fileInfo.statsPath) {
    ctx.turboSnap.bailReason = { missingStatsFile: true };
    ctx.log.warn(missingStatsFile());
    return;
  }

  transitionTo(tracing)(ctx, task);

  const statsPath = join(ctx.sourceDir, ctx.fileInfo.statsPath);
  const { changedFiles, packageManifestChanges } = ctx.git;
  try {
    const changedDependencyNames = await findChangedDependencies(ctx).catch((err) => {
      const { name, message, stack, code } = err;
      ctx.log.debug({ name, message, stack, code });
    });
    if (changedDependencyNames) {
      ctx.git.changedDependencyNames = changedDependencyNames;
      if (!ctx.options.interactive) {
        const list = changedDependencyNames.length
          ? `:\n${changedDependencyNames.map((f) => `  ${f}`).join('\n')}`
          : '';
        ctx.log.info(`Found ${changedDependencyNames.length} changed dependencies${list}`);
      }
    } else {
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

export const uploadStorybook = async (ctx: Context, task: Task) => {
  if (ctx.skip) return;
  transitionTo(preparing)(ctx, task);

  const options = {
    onStart: () => (task.output = starting().output),
    onProgress: throttle(
      (progress, total) => {
        const percentage = Math.round((progress / total) * 100);
        task.output = uploading({ percentage }).output;

        ctx.options.experimental_onTaskProgress?.({ ...ctx }, { progress, total, unit: 'bytes' });
      },
      // Avoid spamming the logs with progress updates in non-interactive mode
      ctx.options.interactive ? 100 : ctx.env.CHROMATIC_OUTPUT_INTERVAL
    ),
    onComplete: (uploadedBytes: number, domain: string) => {
      ctx.uploadedBytes = uploadedBytes;
      ctx.isolatorUrl = new URL('/iframe.html', domain).toString();
    },
    onError: (error: Error, path?: string) => {
      throw path === error.message ? new Error(failed({ path }).output) : error;
    },
  };

  const files = ctx.fileInfo.paths.map((path) => ({
    localPath: join(ctx.sourceDir, path),
    targetPath: path,
    contentLength: ctx.fileInfo.lengths.find(({ knownAs }) => knownAs === path).contentLength,
  }));

  if (ctx.options.zip) {
    try {
      await uploadAsZipFile(ctx, files, options);
    } catch (err) {
      ctx.log.debug({ err }, 'Error uploading zip file');
      await uploadAsIndividualFiles(ctx, files, options);
    }
  } else {
    await uploadAsIndividualFiles(ctx, files, options);
  }
};

export default createTask({
  name: 'upload',
  title: initial.title,
  skip: (ctx: Context) => {
    if (ctx.skip) return true;
    if (ctx.options.dryRun) return dryRun().output;
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
