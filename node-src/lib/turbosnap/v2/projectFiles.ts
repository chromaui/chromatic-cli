import { readdir, realpath, stat } from 'fs/promises';
import path from 'path';

import { FileHash } from './graph';

/**
 * Every disk read TurboSnap 2.0 makes, behind one interface, so the rules about what the disk means
 * live here rather than at each call site: which paths are readable at all, how a symlink is named,
 * and when absence is an answer rather than a failure.
 *
 * The error contract is per method, and it is the reason this is one interface rather than a bag of
 * helpers. Absence is an *answer* for `isFile`, `isDirectory`, `listTree` and `packageVersion`: a
 * configured-but-missing static directory, a module named after a directory and an uninstallable
 * package are all conditions the caller has a correct answer for. Unreadability is a *bug* for
 * `hashAll` alone: a file we found and then could not read means the manifest would silently omit
 * content, so it throws and TurboSnap bails to v1 instead.
 *
 * The synchronous methods are synchronous because their callers are: the stats sweep decides per
 * module name whether there is anything hashable there, and threading a promise through that loop
 * buys nothing.
 */
export interface ProjectFiles {
  /** False for a directory: a builder may name a module after one, and reading it throws EISDIR. */
  isFile(absolutePath: string): boolean;
  isDirectory(absolutePath: string): boolean;
  /** Undefined when unresolvable; resolves the package manifest, not a dist path. */
  packageVersion(fromDirectory: string, packageName: string): string | undefined;
  /** Throws, naming the path, when a file cannot be read. */
  hashAll(absolutePaths: string[]): Promise<Record<string, FileHash>>;
  /** Follows symlinks, names files by the link path, terminates on a cycle, empty when absent. */
  listTree(absoluteDirectory: string): Promise<string[]>;
}

/**
 * A mutable box the in-memory adapter reads, so a suite can set its disk per test and share one
 * adapter instance.
 */
export interface DirectoryTreeReference {
  /** Entry names per absolute directory. A name a key does not exist for is a file. */
  current: Record<string, string[]>;
}

/**
 * The adapter backed by the real disk. Constructed explicitly by the caller, never defaulted: a
 * default is exactly how a test would silently read the machine it runs on.
 *
 * Only `listTree` is here; the other four methods on {@link ProjectFiles} still read the disk from
 * their own call sites, so the adapters and the fields that hold them name the moved subset until
 * each one arrives.
 *
 * @returns The real adapter.
 */
export function realProjectFiles(): Pick<ProjectFiles, 'listTree'> {
  return {
    listTree: (absoluteDirectory: string) => listFilesRecursively(absoluteDirectory),
  };
}

/**
 * The adapter backed by a directory tree supplied as a value, so a suite describes its disk instead
 * of mocking `fs`. Symlinks, cycles and unreadable directories are not modelled: those are rules of
 * the real disk, and pinning them against a fake only proves the fake follows them. See
 * projectFiles.test.ts, which pins them against real temporary directories.
 *
 * @param directoryTree The entry names per absolute directory, read on each call so a test can set
 * the tree after the adapter is constructed.
 *
 * @returns The in-memory adapter.
 */
export function inMemoryProjectFiles(
  directoryTree: DirectoryTreeReference
): Pick<ProjectFiles, 'listTree'> {
  function listTreeSync(absoluteDirectory: string): string[] {
    const entries = directoryTree.current[absoluteDirectory];
    if (!entries) return [];

    return entries.flatMap((name) => {
      const entryPath = path.join(absoluteDirectory, name);
      return directoryTree.current[entryPath] ? listTreeSync(entryPath) : [entryPath];
    });
  }

  return {
    listTree: (absoluteDirectory: string) => Promise.resolve(listTreeSync(absoluteDirectory)),
  };
}

/**
 * Lists every file under a directory, recursively, following symlinks. A directory that doesn't exist
 * contributes nothing rather than throwing: a configured-but-missing `staticDir` is not an error, and
 * v1 never matches such a path either. The same holds for a broken symlink, whose target can't be read.
 *
 * Symlinks are followed because Storybook copies and serves the bytes they resolve to, so a skipped one
 * is a silent content gap — `.storybook/static/vendor -> ../../node_modules/pkg/dist` would make a
 * whole served tree invisible. Files are named by the *link's* path, since that is the URL they are
 * served at.
 *
 * @param directory The absolute directory to walk.
 * @param visitedDirectories Resolved real paths already walked, so a symlink cycle terminates.
 *
 * @returns The absolute path of every file found.
 */
async function listFilesRecursively(
  directory: string,
  visitedDirectories = new Set<string>()
): Promise<string[]> {
  // Resolving before walking is what stops a symlink loop from diverging. Static files are hashed
  // unbounded by design, so there is no count cap to fall back on.
  let realDirectory;
  try {
    realDirectory = await realpath(directory);
  } catch {
    return [];
  }
  if (visitedDirectories.has(realDirectory)) return [];
  visitedDirectories.add(realDirectory);

  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return listFilesRecursively(entryPath, visitedDirectories);
      if (entry.isFile()) return [entryPath];

      // A symlink is neither, so ask `stat`, which follows it. Anything else with no bytes of its own
      // — a socket, a device, a broken link — contributes nothing.
      try {
        const stats = await stat(entryPath);
        if (stats.isDirectory()) return listFilesRecursively(entryPath, visitedDirectories);
        return stats.isFile() ? [entryPath] : [];
      } catch {
        return [];
      }
    })
  );

  return files.flat();
}
