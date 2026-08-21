import { readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'fs';
import { Dirent } from 'fs';
import { createRequire } from 'module';
import path from 'path';

import { AbsolutePath } from '../../../types';
import { getFileHashes } from '../../getFileHashes';
import { Logger } from '../../log';
import { FileHash } from './graph';

/**
 * Every disk read TurboSnap v2 makes, behind one interface, so the rules about what the disk means
 * live here rather than at each call site.
 */
export interface ProjectFiles {
  isFile(absolutePath: AbsolutePath): boolean;
  isDirectory(absolutePath: AbsolutePath): boolean;
  /** Undefined when unresolvable; resolves the package manifest, not a dist path. */
  packageVersion(fromDirectory: AbsolutePath, packageName: string): string | undefined;
  /** Throws, naming the path, when a file cannot be read. `concurrency` bounds parallel reads. */
  hashAll(
    absolutePaths: AbsolutePath[],
    concurrency?: number
  ): Promise<Record<AbsolutePath, FileHash>>;
  /** Follows symlinks, names files by the link path, terminates on a cycle, empty when absent. */
  listTree(absoluteDirectory: AbsolutePath): AbsolutePath[];
  /** Writes the contents to the file, creating or overwriting it. */
  writeFile(absolutePath: AbsolutePath, contents: string): void;
}

/**
 * The adapter backed by the real disk. Constructed explicitly by the caller, never defaulted: a
 * default is exactly how a test would silently read the machine it runs on.
 *
 * @param log The logger to use.
 *
 * @returns An adapter to read from the real file system.
 */
export function realProjectFiles(log: Logger): ProjectFiles {
  return {
    isFile: (absolutePath: AbsolutePath) =>
      statSync(absolutePath, { throwIfNoEntry: false })?.isFile() ?? false,
    isDirectory: (absolutePath: AbsolutePath) =>
      statSync(absolutePath, { throwIfNoEntry: false })?.isDirectory() ?? false,
    packageVersion: readPackageVersion,
    hashAll: hashFileContents,
    listTree: (absoluteDirectory: AbsolutePath) => listFilesRecursively(log, absoluteDirectory),
    writeFile: (absolutePath: AbsolutePath, contents: string) =>
      writeFileSync(absolutePath, contents),
  };
}

/**
 * Reads a package's installed version from its own `package.json`, resolved from a directory.
 *
 * @param fromDirectory The absolute directory to resolve from.
 * @param packageName The package to read the version of.
 *
 * @returns The installed version, or undefined when the package cannot be resolved or read.
 */
function readPackageVersion(fromDirectory: AbsolutePath, packageName: string): string | undefined {
  const requireFromDirectory = createRequire(path.join(fromDirectory, 'package.json'));

  try {
    const packageJsonPath = requireFromDirectory.resolve(`${packageName}/package.json`);
    const { version } = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    return version;
  } catch {
    return undefined;
  }
}

/**
 * Content-hashes files by absolute path, bounded by a concurrency limit.
 *
 * @param absolutePaths The absolute paths to hash.
 * @param concurrency The number of files to hash at once. Defaults via `getFileHashes` when omitted.
 *
 * @returns The content hash of each file, keyed by the absolute path it was read from.
 */
async function hashFileContents(
  absolutePaths: AbsolutePath[],
  concurrency?: number
): Promise<Record<AbsolutePath, FileHash>> {
  if (absolutePaths.length === 0) return {};

  try {
    return await getFileHashes({ files: absolutePaths, concurrency });
  } catch (error) {
    throw new Error(`Could not hash ${namePathThatFailed(error, absolutePaths)}: ${error.message}`);
  }
}

/**
 * Names the file a failed read was about.
 *
 * @param error The thrown read failure.
 * @param absolutePaths The paths the read was asked about.
 *
 * @returns The path, or a description of the set it came from.
 */
function namePathThatFailed(error: any, absolutePaths: AbsolutePath[]): string {
  return error?.path ? String(error.path) : `one of the ${absolutePaths.length} files hashed`;
}

/**
 * Lists every file under a directory, recursively, following symlinks. A directory that doesn't exist
 * contributes nothing rather than throwing: a configured-but-missing `staticDir` is not an error, and
 * v1 never matches such a path either. The same holds for a broken symlink, whose target can't be read.
 *
 * @param log The logger to use.
 * @param directory The absolute directory to walk.
 * @param ancestorDirectories Resolved real paths in the current branch, so a symlink cycle
 * terminates without suppressing sibling aliases to the same directory.
 *
 * @returns The absolute path of every file found.
 */
function listFilesRecursively(
  log: Logger,
  directory: AbsolutePath,
  ancestorDirectories = new Set<AbsolutePath>()
): AbsolutePath[] {
  let realDirectory;
  try {
    realDirectory = realpathSync(directory);
  } catch (error) {
    log.warn(`Failed to resolve ${directory} when listing files`, error);
    return [];
  }

  if (ancestorDirectories.has(realDirectory)) {
    return [];
  }
  ancestorDirectories.add(realDirectory);

  try {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      log.warn(`Failed to read directory ${directory} when listing files`, error);
      return [];
    }

    return entries.flatMap((entry: Dirent) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return listFilesRecursively(log, entryPath, ancestorDirectories);
      }
      if (entry.isFile()) {
        return [entryPath];
      }

      // A symlink is neither, so ask `stat`, which follows it. Anything else with no bytes of its own
      // — a socket, a device, a broken link — contributes nothing.
      try {
        const stats = statSync(entryPath);
        if (stats.isDirectory()) {
          return listFilesRecursively(log, entryPath, ancestorDirectories);
        }
        return stats.isFile() ? [entryPath] : [];
      } catch (error) {
        log.warn(`Failed to stat ${entryPath} when listing files`, error);
        return [];
      }
    });
  } finally {
    ancestorDirectories.delete(realDirectory);
  }
}
