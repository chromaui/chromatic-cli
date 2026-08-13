import { readdirSync, readFileSync, realpathSync, statSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';

import { AbsolutePath } from '../../../types';
import { getFileHashes } from '../../getFileHashes';
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
  /** Throws, naming the path, when a file cannot be read. */
  hashAll(absolutePaths: AbsolutePath[]): Promise<Record<AbsolutePath, FileHash>>;
  /** Follows symlinks, names files by the link path, terminates on a cycle, empty when absent. */
  listTree(absoluteDirectory: AbsolutePath): AbsolutePath[];
}

/**
 * The adapter backed by the real disk. Constructed explicitly by the caller, never defaulted: a
 * default is exactly how a test would silently read the machine it runs on.
 *
 * @returns An adapter to read from the real file system.
 */
export function realProjectFiles(): ProjectFiles {
  return {
    isFile: (absolutePath: AbsolutePath) =>
      statSync(absolutePath, { throwIfNoEntry: false })?.isFile() ?? false,
    isDirectory: (absolutePath: AbsolutePath) =>
      statSync(absolutePath, { throwIfNoEntry: false })?.isDirectory() ?? false,
    packageVersion: readPackageVersion,
    hashAll: hashFileContents,
    listTree: (absoluteDirectory: AbsolutePath) => listFilesRecursively(absoluteDirectory),
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
 *
 * @returns The content hash of each file, keyed by the absolute path it was read from.
 */
async function hashFileContents(
  absolutePaths: AbsolutePath[]
): Promise<Record<AbsolutePath, FileHash>> {
  if (absolutePaths.length === 0) return {};

  try {
    // getFileHashes joins its directory argument with each file; pass '' so the absolute paths are
    // used as-is, and it returns hashes keyed by those absolute paths.
    return await getFileHashes(absolutePaths, '', 10);
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
 * @param directory The absolute directory to walk.
 * @param visitedDirectories Resolved real paths already walked, so a symlink cycle terminates.
 *
 * @returns The absolute path of every file found.
 */
function listFilesRecursively(
  directory: AbsolutePath,
  visitedDirectories = new Set<AbsolutePath>()
): AbsolutePath[] {
  let realDirectory;
  try {
    realDirectory = realpathSync(directory);
  } catch {
    return [];
  }

  if (visitedDirectories.has(realDirectory)) {
    return [];
  }
  visitedDirectories.add(realDirectory);

  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries.flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listFilesRecursively(entryPath, visitedDirectories);
    }
    if (entry.isFile()) {
      return [entryPath];
    }

    // A symlink is neither, so ask `stat`, which follows it. Anything else with no bytes of its own
    // — a socket, a device, a broken link — contributes nothing.
    try {
      const stats = statSync(entryPath);
      if (stats.isDirectory()) {
        return listFilesRecursively(entryPath, visitedDirectories);
      }
      return stats.isFile() ? [entryPath] : [];
    } catch {
      return [];
    }
  });
}
