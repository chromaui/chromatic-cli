import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import slash from 'slash';

import { AnnouncedBuild, Context, FileInfo } from '../../types';
import deviatingOutputDirectory from '../../ui/messages/warnings/deviatingOutputDirectory';

type ValidateFilesDeps = Pick<Context, 'log' | 'options' | 'packageJson'>;

export interface ValidateFilesInput {
  isReactNativeApp: boolean;
  sourceDir: string;
  buildLogFile?: string;
  browsers: AnnouncedBuild['browsers'];
  validator: (
    fileInfo: FileInfo,
    browsers: AnnouncedBuild['browsers']
  ) => { valid: boolean; missingFiles: string[] };
  validationErrorBuilder: (missingFiles?: string[]) => Error;
  getFileInfoErrorBuilder: (err: Error) => Error;
}

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
 * @param rootDirectory - The root directory to scan
 * @param dirname - The current subdirectory being scanned (relative to rootDirectory)
 *
 * @returns Array of path specifications with pathname and content length
 */
function getPathSpecsInDirectory(rootDirectory: string, dirname = '.'): PathSpec[] {
  // .chromatic is a special directory reserved for internal use and should not be uploaded
  if (dirname === '.chromatic') {
    return [];
  }

  return readdirSync(path.join(rootDirectory, dirname)).flatMap((p: string) => {
    const pathname = path.join(dirname, p);
    const stats = statSync(path.join(rootDirectory, pathname));
    return stats.isDirectory()
      ? getPathSpecsInDirectory(rootDirectory, pathname)
      : [{ pathname, contentLength: stats.size }];
  });
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
 * @param sourceDirectory - The directory to analyze
 *
 * @returns Object containing file lengths, paths, stats path, and total size
 */
function getFileInfo(sourceDirectory: string) {
  const lengths = getPathSpecsInDirectory(sourceDirectory).map((o) => ({
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
export const isValidStorybook = ({ paths, total }) => {
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
export const isValidReactNativeStorybook = (
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
 * @param deps - Dependencies for logging and file info retrieval
 * @param input - Input parameters for validation
 *
 * @returns The validated fileInfo and the (possibly corrected) sourceDir.
 *
 * @throws {Error} if no valid Storybook build is found
 */
export async function validateFiles(
  deps: ValidateFilesDeps,
  input: ValidateFilesInput
): Promise<{ fileInfo: FileInfo; sourceDir: string }> {
  // eslint-disable-next-line unicorn/prevent-abbreviations
  let sourceDir = input.sourceDir;
  let fileInfo: FileInfo;
  try {
    fileInfo = getFileInfo(sourceDir);
  } catch (err) {
    deps.log.debug(err);
    throw input.getFileInfoErrorBuilder(err);
  }

  if (!input.validator(fileInfo, input.browsers).valid && input.buildLogFile) {
    try {
      const buildLog = readFileSync(input.buildLogFile, 'utf8');
      const outputDirectory = getOutputDirectory(buildLog);
      if (outputDirectory && outputDirectory !== sourceDir) {
        deps.log.warn(deviatingOutputDirectory({ sourceDir, ...deps }, outputDirectory));
        sourceDir = outputDirectory;
        fileInfo = getFileInfo(sourceDir);
      }
    } catch (err) {
      deps.log.debug(err);
    }
  }

  const validatorResult = input.validator(fileInfo, input.browsers);
  if (!validatorResult.valid) {
    throw input.validationErrorBuilder(validatorResult.missingFiles);
  }
  return { fileInfo, sourceDir };
}
