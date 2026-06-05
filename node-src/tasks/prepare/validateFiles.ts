import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { stripVTControlCharacters } from 'util';

import { posix } from '../../lib/posix';
import { Context } from '../../types';
import deviatingOutputDirectory from '../../ui/messages/warnings/deviatingOutputDirectory';
import { invalid, invalidReactNative } from '../../ui/tasks/prepare';

/**
 * Represents a file path specification with its content length.
 */
interface PathSpec {
  pathname: string;
  contentLength: number;
}

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
  const cleanLog = stripVTControlCharacters(buildLog);
  const lines = cleanLog.split('\n');

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const outputIndex = lines[index].lastIndexOf('Output directory:');
    if (outputIndex === -1) continue;

    const sameLineOutput = lines[index].slice(outputIndex + 'Output directory:'.length).trim();
    if (sameLineOutput) return sameLineOutput;

    for (let index_ = index + 1; index_ < lines.length; index_ += 1) {
      // Remove Box Drawing glyphs (U+2500–U+257F)
      const candidate = lines[index_].replace(/^[\s\u2500-\u257F]+/u, '').trim();
      if (!candidate) continue;
      return candidate;
    }
  }

  return undefined;
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
    knownAs: posix(o.pathname),
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
const isValidStorybook = ({ paths, total }) => {
  const missingFiles = ['iframe.html', 'index.html'].filter((f) => !paths.includes(f));
  return { valid: total > 0 && missingFiles.length === 0, missingFiles };
};

/**
 * Determines if a directory contains a valid React Native Storybook build.
 * A valid React Native Storybook must have non-zero total size, contain a
 * manifest.json file, and storybook.apk _and/or_ storybook.app depending on
 * the builds enabled browsers.
 *
 * @param fileInfo - Object containing paths array and total size
 * @param fileInfo.paths - Array of file paths in the directory
 * @param fileInfo.total - Total size of all files in bytes
 * @param browsers - The list of browsers to capture for the build
 *
 * @returns True if the directory contains a valid React Native Storybook build
 */
const isValidReactNativeStorybook = (
  { paths, total },
  browsers: string[] = []
): { valid: boolean; missingFiles: string[] } => {
  const hasAndroid = browsers.includes('android');
  const hasIOS = browsers.includes('ios');
  const missingFiles: string[] = [];

  if (!hasAndroid && !hasIOS) {
    return { valid: false, missingFiles };
  }

  if (!paths.includes('manifest.json')) {
    missingFiles.push('manifest.json');
  }

  // Ensure we have a storybook.apk file on Android builds
  if (hasAndroid && !paths.includes('storybook.apk')) {
    missingFiles.push('storybook.apk');
  }

  // Ensure we have a storybook.app directory on iOS builds
  if (hasIOS && !paths.some((path: string) => path.startsWith('storybook.app/'))) {
    missingFiles.push('storybook.app');
  }

  return { valid: total > 0 && missingFiles.length === 0, missingFiles };
};

/**
 * Validates that the source directory contains a valid Storybook build.
 * If validation fails and a build log is available, attempts to find the
 * correct output directory from the log and retries validation.
 *
 * @param ctx - The CLI context containing source directory and build log info
 *
 * @throws {Error} if no valid Storybook build is found
 */
export async function validateFiles(ctx: Context) {
  const validator = ctx.isReactNativeApp ? isValidReactNativeStorybook : isValidStorybook;
  const browsers = ctx.announcedBuild?.browsers;

  ctx.fileInfo = getFileInfo(ctx, ctx.sourceDir);

  if (!validator(ctx.fileInfo, browsers).valid && ctx.buildLogFile) {
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

  const validatorResult = validator(ctx.fileInfo, browsers);
  if (!validatorResult.valid) {
    throw new Error(
      ctx.isReactNativeApp
        ? invalidReactNative(ctx, validatorResult.missingFiles).output
        : invalid(ctx).output
    );
  }
}
