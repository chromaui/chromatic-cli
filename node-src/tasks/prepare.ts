import * as turbosnap from '@cli/turbosnap';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import semver from 'semver';
import slash from 'slash';

import { getFileHashes } from '../lib/getFileHashes';
import { createTask, transitionTo } from '../lib/tasks';
import { rewriteErrorMessage } from '../lib/utils';
import { Context, Task } from '../types';
import missingStatsFile from '../ui/messages/errors/missingStatsFile';
import deviatingOutputDirectory from '../ui/messages/warnings/deviatingOutputDirectory';
import {
  bailed,
  hashing,
  initial,
  invalid,
  success,
  traced,
  tracing,
  validating,
} from '../ui/tasks/prepare';

/**
 * Represents a file path specification with its content length.
 */
interface PathSpec {
  pathname: string;
  contentLength: number;
}

// These are the special characters that need to be escaped in the filename
// because they are used as special characters in picomatch
const SPECIAL_CHARS_REGEXP = /([$()*+?[\]^])/g;

/**
 * Recursively get all file paths in a directory with their content lengths.
 * Paths are returned relative to the root directory (e.g., if rootDir is storybook-static,
 * paths will be like iframe.html rather than storybook-static/iframe.html).
 * Excludes the .chromatic directory which is reserved for internal use.
 *
 * @param ctx - The CLI context for logging
 * @param rootDirectory - The root directory to scan
 * @param dirname - The current subdirectory being scanned (relative to rootDirectory)
 *
 * @returns Array of path specifications with pathname and content length
 */
function getPathSpecsInDirectory(ctx: Context, rootDirectory: string, dirname = '.'): PathSpec[] {
  // .chromatic is a special directory reserved for internal use and should not be uploaded
  if (dirname === '.chromatic') {
    return [];
  }

  try {
    return readdirSync(path.join(rootDirectory, dirname)).flatMap((p: string) => {
      const pathname = path.join(dirname, p);
      const stats = statSync(path.join(rootDirectory, pathname));
      return stats.isDirectory()
        ? getPathSpecsInDirectory(ctx, rootDirectory, pathname)
        : [{ pathname, contentLength: stats.size }];
    });
  } catch (err) {
    ctx.log.debug(err);
    throw new Error(invalid({ ...ctx, sourceDir: rootDirectory }, err).output);
  }
}

/**
 * Extracts the output directory path from a Storybook build log.
 * Looks for the last occurrence of "Output directory: " in the log.
 *
 * @param buildLog - The contents of the build log file
 *
 * @returns The output directory path if found, undefined otherwise
 */
function getOutputDirectory(buildLog: string) {
  const outputString = 'Output directory: ';
  const outputIndex = buildLog.lastIndexOf(outputString);
  if (outputIndex === -1) return undefined;
  const remainingLog = buildLog.slice(outputIndex + outputString.length);
  const newlineIndex = remainingLog.indexOf('\n');
  const outputDirectory = newlineIndex === -1 ? remainingLog : remainingLog.slice(0, newlineIndex);
  return outputDirectory.trim();
}

/**
 * Analyzes a directory to extract file information needed for upload.
 * Processes all files to calculate total size, collect paths, and locate stats files.
 *
 * @param ctx - The CLI context for logging
 * @param sourceDirectory - The directory to analyze
 *
 * @returns Object containing file lengths, paths, stats path, and total size
 */
function getFileInfo(ctx: Context, sourceDirectory: string) {
  const lengths = getPathSpecsInDirectory(ctx, sourceDirectory).map((o) => ({
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

/**
 * Determines if a directory contains a valid Storybook build.
 * A valid Storybook must have non-zero total size and contain both
 * iframe.html and index.html files, which are essential for Storybook operation.
 *
 * @param fileInfo - Object containing paths array and total size
 * @param fileInfo.paths - Array of file paths in the directory
 * @param fileInfo.total - Total size of all files in bytes
 *
 * @returns True if the directory contains a valid Storybook build
 */
const isValidStorybook = ({ paths, total }) =>
  total > 0 && paths.includes('iframe.html') && paths.includes('index.html');

/**
 * Validates that the source directory contains a valid Storybook build.
 * If validation fails and a build log is available, attempts to find the
 * correct output directory from the log and retries validation.
 *
 * @param ctx - The CLI context containing source directory and build log info
 *
 * @throws Error if no valid Storybook build is found
 */
export async function validateFiles(ctx: Context) {
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
}

/**
 * Traces which story files are affected by recent changes using TurboSnap.
 * Analyzes changed files to determine which stories need to be tested.
 *
 * @param ctx - The CLI context containing git info and TurboSnap configuration
 * @param task - The current Listr task for UI updates
 *
 * @throws Error if stats file is missing or tracing fails
 */
// TODO: refactor this function
// eslint-disable-next-line complexity
export async function traceChangedFiles(ctx: Context, task: Task) {
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
  const { changedFiles } = ctx.git;

  try {
    const onlyStoryFiles = await turbosnap.traceChangedFiles(ctx);
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
}

/**
 * Calculates file hashes for all files to be uploaded.
 * File hashes are used for deduplication and integrity checking during upload.
 * Skips calculation if file hashing is disabled or the task is being skipped.
 *
 * @param ctx - The CLI context containing file info and options
 * @param task - The current Listr task for UI updates
 */
export async function calculateFileHashes(ctx: Context, task: Task) {
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
}

/**
 * Sets up the Listr task for preparing the built storybook for upload to Chromatic.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns A Listr task.
 */
export default function main(ctx: Context) {
  return createTask({
    name: 'prepare',
    title: initial(ctx).title,
    skip: (ctx: Context) => {
      return !!ctx.skip;
    },
    steps: [
      transitionTo(validating),
      validateFiles,
      traceChangedFiles,
      calculateFileHashes,
      transitionTo(success, true),
    ],
  });
}
