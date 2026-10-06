import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'fs';
import { Dirent, Stats } from 'fs';
import { createRequire } from 'module';
import path from 'path';

import { GitDeps } from '../../../git/execGit';
import { getIgnoredPaths, IgnoredPaths } from '../../../git/git';
import { AbsolutePath } from '../../../types';
import { getFileHashes } from '../../getFileHashes';
import { Logger } from '../../log';
import { FileHash } from './graph';

/**
 * Every disk and git read TurboSnap v2 makes, behind one interface, so the rules about what the disk
 * means live here rather than at each call site.
 */
export interface ProjectFiles {
  /** False when the path names are too long. Every other failure throws. */
  isFile(absolutePath: AbsolutePath): boolean;
  /** False when the path names are too long. Every other failure throws. */
  isDirectory(absolutePath: AbsolutePath): boolean;
  /** Resolves the package manifest. Undefined when unresolvable. */
  packageVersion(fromDirectory: AbsolutePath, packageName: string): string | undefined;
  /** Throws, naming the path, when a file cannot be read. `concurrency` bounds parallel reads. */
  hashAll(
    absolutePaths: AbsolutePath[],
    concurrency?: number
  ): Promise<Record<AbsolutePath, FileHash>>;
  /**
   * Follows symlinks, names files by the link path, terminates on a cycle, empty when absent. A path
   * that names a single file lists that file alone. Throws when the path itself cannot be stat'd for
   * a reason other than absence, matching `isFile` and `isDirectory`.
   */
  listTree(absolutePath: AbsolutePath): AbsolutePath[];
  /** Writes the contents to the file, creating parent directories and overwriting it if present. */
  writeFile(absolutePath: AbsolutePath, contents: string): void;
  /**
   * The path a symlink leads to, or the path itself when it leads nowhere or is not a link. Lets two
   * names for one file (a bundler's resolved path and a configured link path) be compared as one.
   */
  realPath(absolutePath: AbsolutePath): AbsolutePath;
  /**
   * The subset of the paths git ignores: untracked files that `.gitignore` or another exclude source
   * matches. A tracked file is never ignored, whatever the patterns say, and nor is a path outside
   * the repository. Paths are matched as git names them, so a path reached through a symlink is
   * answered as not ignored; resolve it with `realPath` first. Rejects when git cannot answer: a
   * guess of "nothing is ignored" would hash every generated file as a real change, which is the
   * over-capture the skip rule exists to prevent.
   */
  ignoredFiles(absolutePaths: AbsolutePath[]): Promise<Set<AbsolutePath>>;
}

/**
 * The adapter backed by the real disk and the repository the CLI runs in. Constructed explicitly by
 * the caller, never defaulted: a default is exactly how a test would silently read the machine it
 * runs on.
 *
 * @param deps The logger, and the options the git commands read their timeout from.
 * @param deps.log The logger to use.
 * @param deps.options The options to pass to the git commands.
 * @param deps.options.gitTimeout The timeout in milliseconds for the git commands.
 *
 * @returns An adapter to read from the real file system.
 */
export function realProjectFiles(deps: GitDeps): ProjectFiles {
  const { log } = deps;

  // Defined here to cache the result of the git command when there are multiple calls to `ignoredFiles`.
  let ignoredPaths: Promise<IgnoredPaths> | undefined;

  return {
    isFile: (absolutePath: AbsolutePath) => statFile(log, absolutePath)?.isFile() ?? false,
    isDirectory: (absolutePath: AbsolutePath) =>
      statFile(log, absolutePath)?.isDirectory() ?? false,
    packageVersion: (fromDirectory: AbsolutePath, packageName: string) =>
      readPackageVersion(log, fromDirectory, packageName),
    hashAll: hashFileContents,
    listTree: (absolutePath: AbsolutePath) => listTree(log, absolutePath),
    writeFile: (absolutePath: AbsolutePath, contents: string) => {
      mkdirSync(path.dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, contents);
    },
    realPath,
    ignoredFiles: async (absolutePaths: AbsolutePath[]) => {
      ignoredPaths ??= getIgnoredPaths(deps);
      const ignored = await ignoredPaths;
      return new Set(absolutePaths.filter((absolutePath) => ignored.has(absolutePath)));
    },
  };
}

/**
 * Resolves a path to the file it leads to, through any symlinks (a base dir linked from `apps/`, a
 * static dir linked from a package). A path that can't be resolved is returned as is.
 *
 * @param absolutePath The path to resolve.
 *
 * @returns The real path, or the given path when there is nothing there to resolve.
 */
function realPath(absolutePath: AbsolutePath): AbsolutePath {
  try {
    return realpathSync(absolutePath);
  } catch {
    return absolutePath;
  }
}

function statFile(log: Logger, absolutePath: AbsolutePath): Stats | undefined {
  try {
    return statSync(absolutePath, { throwIfNoEntry: false });
  } catch (error) {
    // If the file path is too long, then it's likely not a real file so we skip it.
    if (error.code === 'ENAMETOOLONG') {
      log.debug(
        `Unable to read file path of ${absolutePath.length} characters, skipping since it's not likely to be a real file`
      );
      return undefined;
    }
    throw error;
  }
}

/**
 * Reads a package's installed version from its own `package.json`, resolved from a directory.
 *
 * @param log The logger to record a resolution failure with.
 * @param fromDirectory The absolute directory to resolve from.
 * @param packageName The package to read the version of.
 *
 * @returns The installed version, or undefined when the package cannot be resolved or read.
 */
function readPackageVersion(
  log: Logger,
  fromDirectory: AbsolutePath,
  packageName: string
): string | undefined {
  const requireFromDirectory = createRequire(path.join(fromDirectory, 'package.json'));

  try {
    const packageJsonPath = requireFromDirectory.resolve(`${packageName}/package.json`);
    const { version } = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    return version;
  } catch (error) {
    log.debug(`Could not resolve ${packageName} from ${fromDirectory}`, error);
    // Marking which candidates exist tells a checkout with no install apart from one whose install
    // lacks the package.
    log.debug(
      'Directories checked:',
      requireFromDirectory.resolve
        .paths(`${packageName}/package.json`)
        ?.map((directory) => (existsSync(directory) ? directory : `${directory} (missing)`))
    );
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
 * Lists the files a path names: every file under a directory, or the file itself. Storybook accepts a
 * single file as a `staticDirs` entry and serves it at its basename, so the sweep has to see it too.
 *
 * @param log The logger to use.
 * @param absolutePath The absolute directory to walk, or the absolute file to list.
 *
 * @returns The absolute path of every file found.
 *
 * @throws {Error} When the path itself cannot be stat'd for a reason other than absence, such as a
 * symlink cycle at the path or a permission error, since those are the `isFile` and `isDirectory`
 * rules.
 */
function listTree(log: Logger, absolutePath: AbsolutePath): AbsolutePath[] {
  return statFile(log, absolutePath)?.isFile()
    ? [absolutePath]
    : listFilesRecursively(log, absolutePath);
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
    log.debug(`Failed to resolve ${directory} when listing files`, error);
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
      log.debug(`Failed to read directory ${directory} when listing files`, error);
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
        log.debug(`Failed to stat ${entryPath} when listing files`, error);
        return [];
      }
    });
  } finally {
    ancestorDirectories.delete(realDirectory);
  }
}
