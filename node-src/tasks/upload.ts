import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import semver from 'semver';
import slash from 'slash';

import { checkStorybookBaseDirectory } from '../lib/checkStorybookBaseDirectory';
import { findChangedDependencies } from '../lib/findChangedDependencies';
import { findChangedPackageFiles } from '../lib/findChangedPackageFiles';
import { getDependentStoryFiles } from '../lib/getDependentStoryFiles';
import { getFileHashes } from '../lib/getFileHashes';
import { createTask, transitionTo } from '../lib/tasks';
import { uploadBuild } from '../lib/upload';
import { rewriteErrorMessage, throttle } from '../lib/utils';
import { waitForSentinel } from '../lib/waitForSentinel';
import { Context, FileDesc, Task } from '../types';
import missingStatsFile from '../ui/messages/errors/missingStatsFile';
import bailFile from '../ui/messages/warnings/bailFile';
import deviatingOutputDirectory from '../ui/messages/warnings/deviatingOutputDirectory';
import {
  bailed,
  dryRun,
  failed,
  finalizing,
  hashing,
  initial,
  invalid,
  starting,
  success,
  traced,
  tracing,
  uploading,
  validating,
} from '../ui/tasks/upload';
import { readStatsFile } from './readStatsFile';

interface PathSpec {
  pathname: string;
  contentLength: number;
}
// These are the special characters that need to be escaped in the filename
// because they are used as special characters in picomatch
const SPECIAL_CHARS_REGEXP = /([$()*+?[\]^])/g;

// Get all paths in rootDir, starting at dirname.
// We don't want the paths to include rootDir -- so if rootDir = storybook-static,
// paths will be like iframe.html rather than storybook-static/iframe.html
function getPathsInDirectory(ctx: Context, rootDirectory: string, dirname = '.'): PathSpec[] {
  // .chromatic is a special directory reserved for internal use and should not be uploaded
  if (dirname === '.chromatic') {
    return [];
  }

  try {
    return readdirSync(path.join(rootDirectory, dirname)).flatMap((p: string) => {
      const pathname = path.join(dirname, p);
      const stats = statSync(path.join(rootDirectory, pathname));
      return stats.isDirectory()
        ? getPathsInDirectory(ctx, rootDirectory, pathname)
        : [{ pathname, contentLength: stats.size }];
    });
  } catch (err) {
    ctx.log.debug(err);
    throw new Error(invalid({ sourceDir: rootDirectory } as any, err).output);
  }
}

function getOutputDirectory(buildLog: string) {
  const outputString = 'Output directory: ';
  const outputIndex = buildLog.lastIndexOf(outputString);
  if (outputIndex === -1) return undefined;
  const remainingLog = buildLog.slice(outputIndex + outputString.length);
  const newlineIndex = remainingLog.indexOf('\n');
  const outputDirectory = newlineIndex === -1 ? remainingLog : remainingLog.slice(0, newlineIndex);
  return outputDirectory.trim();
}

function getFileInfo(ctx: Context, sourceDirectory: string) {
  const lengths = getPathsInDirectory(ctx, sourceDirectory).map((o) => ({
    ...o,
    knownAs: slash(o.pathname),
  }));
  const total = lengths.map(({ contentLength }) => contentLength).reduce((a, b) => a + b, 0);
  const paths: string[] = [];
  let statsPath = '';
  for (const { knownAs } of lengths) {
    if (knownAs.endsWith('preview-stats.json')) statsPath = path.join(sourceDirectory, knownAs);
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
      const outputDirectory = getOutputDirectory(buildLog);
      if (outputDirectory && outputDirectory !== ctx.sourceDir) {
        ctx.log.warn(deviatingOutputDirectory(ctx, outputDirectory));
        ctx.sourceDir = outputDirectory;
        ctx.fileInfo = getFileInfo(ctx, ctx.sourceDir);
      }
    } catch (err) {
      ctx.log.debug(err);
    }
  }

  if (!isValidStorybook(ctx.fileInfo)) {
    throw new Error(invalid(ctx).output);
  }
};

// TODO: refactor this function
// eslint-disable-next-line complexity, max-statements
export const traceChangedFiles = async (ctx: Context, task: Task) => {
  if (!ctx.turboSnap || ctx.turboSnap.unavailable) return;
  if (!ctx.git.changedFiles) return;
  if (!ctx.fileInfo?.statsPath) {
    // If we don't know the SB version, we should assume we don't support `--stats-json`
    const nonLegacyStatsSupported =
      ctx.storybook?.version &&
      semver.gte(semver.coerce(ctx.storybook.version) || '0.0.0', '8.0.0');

    ctx.turboSnap.bailReason = { missingStatsFile: true };
    throw new Error(missingStatsFile({ legacy: !nonLegacyStatsSupported }));
  }

  transitionTo(tracing)(ctx, task);

  const { statsPath } = ctx.fileInfo;
  const { changedFiles, packageMetadataChanges } = ctx.git;

  try {
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    let changedDependencyNames: void | string[] = [];
    if (packageMetadataChanges?.length) {
      changedDependencyNames = await findChangedDependencies(ctx).catch((err) => {
        const { name, message, stack, code } = err;
        ctx.log.debug({ name, message, stack, code });
      });
      if (changedDependencyNames) {
        ctx.git.changedDependencyNames = changedDependencyNames;
        if (!ctx.options.interactive) {
          const list =
            changedDependencyNames.length > 0
              ? `:\n${changedDependencyNames.map((f) => `  ${f}`).join('\n')}`
              : '';
          ctx.log.info(`Found ${changedDependencyNames.length} changed dependencies${list}`);
        }
      } else {
        ctx.log.warn(`Could not retrieve dependency changes from lockfiles; checking package.json`);

        const changedPackageFiles = await findChangedPackageFiles(packageMetadataChanges);
        if (changedPackageFiles.length > 0) {
          ctx.turboSnap.bailReason = { changedPackageFiles };
          ctx.log.warn(bailFile({ turboSnap: ctx.turboSnap }));
          return;
        }
      }
    }

    const stats = await readStatsFile(statsPath);

    await checkStorybookBaseDirectory(ctx, stats);

    const onlyStoryFiles = await getDependentStoryFiles(
      ctx,
      stats,
      statsPath,
      changedFiles,
      changedDependencyNames || []
    );
    if (onlyStoryFiles) {
      // Escape special characters in the filename so it does not conflict with picomatch
      ctx.onlyStoryFiles = Object.keys(onlyStoryFiles).map((key) =>
        key.replaceAll(SPECIAL_CHARS_REGEXP, String.raw`\$1`)
      );

      if (!ctx.options.interactive) {
        if (!ctx.options.traceChanged) {
          ctx.log.info(
            `Found affected story files:\n${Object.entries(onlyStoryFiles)
              .flatMap(([id, files]) => files.map((f) => `  ${f} [${id}]`))
              .join('\n')}`
          );
        }
        if (ctx.untracedFiles && ctx.untracedFiles.length > 0) {
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

export const calculateFileHashes = async (ctx: Context, task: Task) => {
  if (ctx.skip || !ctx.options.fileHashing) return;
  transitionTo(hashing)(ctx, task);

  try {
    if (!ctx.fileInfo) {
      throw new Error(invalid(ctx).output);
    }

    const start = Date.now();
    ctx.fileInfo.hashes = await getFileHashes(
      ctx.fileInfo.paths,
      ctx.sourceDir,
      ctx.env.CHROMATIC_HASH_CONCURRENCY
    );
    ctx.log.debug(`Calculated file hashes in ${Date.now() - start}ms`);
  } catch (err) {
    ctx.log.warn('Failed to calculate file hashes');
    ctx.log.debug(err);
  }
};

export const uploadStorybook = async (ctx: Context, task: Task) => {
  if (ctx.skip) return;
  transitionTo(starting)(ctx, task);

  const files = ctx.fileInfo?.paths.map<FileDesc>((filePath) => ({
    ...(ctx.fileInfo?.hashes && { contentHash: ctx.fileInfo.hashes[filePath] }),
    contentLength:
      ctx.fileInfo?.lengths.find(({ knownAs }) => knownAs === filePath)?.contentLength ?? -1,
    localPath: path.join(ctx.sourceDir, filePath),
    targetPath: filePath,
  }));

  if (!files) {
    throw new Error(invalid(ctx).output);
  }

  await uploadBuild(ctx, files, {
    onProgress: throttle(
      (progress, total) => {
        const percentage = Math.round((progress / total) * 100);
        task.output = uploading({ percentage }).output;
        ctx.options.experimental_onTaskProgress?.({ ...ctx }, { progress, total, unit: 'bytes' });
      },
      // Avoid spamming the logs with progress updates in non-interactive mode
      ctx.options.interactive ? 100 : ctx.env.CHROMATIC_OUTPUT_INTERVAL
    ),
    onError: (error: Error, path?: string) => {
      throw path === error.message ? new Error(failed({ path }).output) : error;
    },
  });
};

export const waitForSentinels = async (ctx: Context, task: Task) => {
  if (ctx.skip || !ctx.sentinelUrls?.length) return;
  transitionTo(finalizing)(ctx, task);

  // Dedupe sentinels, ignoring query params
  const sentinels = Object.fromEntries(
    ctx.sentinelUrls.map((url) => {
      const { host, pathname } = new URL(url);
      return [host + pathname, { name: pathname.split('/').at(-1) || '', url }];
    })
  );

  await Promise.all(Object.values(sentinels).map((sentinel) => waitForSentinel(ctx, sentinel)));
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
    calculateFileHashes,
    uploadStorybook,
    waitForSentinels,
    transitionTo(success, true),
  ],
});
