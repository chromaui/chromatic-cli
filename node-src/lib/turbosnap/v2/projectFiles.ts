import { readFileSync, statSync } from 'fs';
import { readdir, realpath, stat } from 'fs/promises';
import { createRequire } from 'module';
import path from 'path';

import { getFileHashes } from '../../getFileHashes';
import { FileHash } from './graph';

// Bounds how many files are read concurrently. getFileHashes allocates a 64K read buffer per
// in-flight file, so this also caps peak memory regardless of how many files are hashed. It is a
// property of the module rather than an argument, so no caller has to remember to pass it.
const HASH_CONCURRENCY = 10;

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
 * A disk described as a value, for the in-memory adapter. Every field is optional, so a suite
 * describes only the part of the disk its assertion turns on.
 */
export interface InMemoryDisk {
  /** Entry names per absolute directory. A path a key exists for is a directory. */
  directories?: Record<string, string[]>;
  /** Content hash per absolute file path. A file with no entry here hashes as `x`. */
  fileHashes?: Record<string, FileHash>;
  /** Installed version per package name, whatever directory it is resolved from. */
  packageVersions?: Record<string, string>;
  /**
   * Whether a path has no file on disk. Everything else is a file, which is what keeps a suite from
   * having to list every source file its stats fixture names.
   */
  isAbsent?: (absolutePath: string) => boolean;
}

/**
 * A mutable box the in-memory adapter reads, so a suite can set its disk per test and share one
 * adapter instance.
 */
export interface InMemoryDiskReference {
  current: InMemoryDisk;
}

/**
 * The adapter backed by the real disk. Constructed explicitly by the caller, never defaulted: a
 * default is exactly how a test would silently read the machine it runs on.
 *
 * @returns The real adapter.
 */
export function realProjectFiles(): ProjectFiles {
  return {
    isFile: (absolutePath: string) =>
      statSync(absolutePath, { throwIfNoEntry: false })?.isFile() ?? false,
    isDirectory: (absolutePath: string) =>
      statSync(absolutePath, { throwIfNoEntry: false })?.isDirectory() ?? false,
    packageVersion: readPackageVersion,
    hashAll: hashFileContents,
    listTree: (absoluteDirectory: string) => listFilesRecursively(absoluteDirectory),
  };
}

/**
 * The adapter backed by a disk supplied as a value, so a suite describes its disk instead of mocking
 * `fs`. Symlinks, cycles and unreadable directories are not modelled: those are rules of the real
 * disk, and pinning them against a fake only proves the fake follows them. See projectFiles.test.ts,
 * which pins them against real temporary directories.
 *
 * A path ending in `/` reads as a directory, which is how a builder that names a module after one
 * spells it, so a suite names such a module without describing a tree for it.
 *
 * @param disk The disk to read, read on each call so a test can set it after the adapter is
 * constructed.
 *
 * @returns The in-memory adapter.
 */
export function inMemoryProjectFiles(disk: InMemoryDiskReference): ProjectFiles {
  function isDirectory(absolutePath: string): boolean {
    return absolutePath.endsWith('/') || Boolean(disk.current.directories?.[absolutePath]);
  }

  function isFile(absolutePath: string): boolean {
    return !isDirectory(absolutePath) && !disk.current.isAbsent?.(absolutePath);
  }

  function listTreeSync(absoluteDirectory: string): string[] {
    const entries = disk.current.directories?.[absoluteDirectory];
    if (!entries) return [];

    return entries.flatMap((name) => {
      const entryPath = path.join(absoluteDirectory, name);
      return disk.current.directories?.[entryPath] ? listTreeSync(entryPath) : [entryPath];
    });
  }

  return {
    isFile,
    isDirectory,
    packageVersion: (_fromDirectory: string, packageName: string) =>
      disk.current.packageVersions?.[packageName],
    hashAll: (absolutePaths: string[]) => {
      // The real reader throws for anything it cannot read, so refusing here too keeps the callers'
      // "don't hash a directory" guards honest: a suite that lost one sees this instead of a hash.
      const unreadable = absolutePaths.find((absolutePath) => !isFile(absolutePath));
      if (unreadable) return Promise.reject(new Error(`Could not hash ${unreadable}`));

      return Promise.resolve(
        Object.fromEntries(
          absolutePaths.map((absolutePath) => [
            absolutePath,
            disk.current.fileHashes?.[absolutePath] ?? 'x',
          ])
        )
      );
    },
    listTree: (absoluteDirectory: string) => Promise.resolve(listTreeSync(absoluteDirectory)),
  };
}

/**
 * Reads a package's installed version from its own `package.json`, resolved from a directory.
 *
 * Resolves the package's manifest rather than a path inside it: `dist/*` entries are often absent
 * from the `exports` map, so resolving one fails with ERR_PACKAGE_PATH_NOT_EXPORTED. A package that
 * does not export `./package.json` either still fails, and reports no version. The manifest is then
 * read off disk rather than `require`d, which keeps it out of the require cache. Resolution walks up
 * from the directory, so a workspace-hoisted install is found too.
 *
 * @param fromDirectory The absolute directory to resolve from.
 * @param packageName The package to read the version of.
 *
 * @returns The installed version, or undefined when the package cannot be resolved or read.
 */
function readPackageVersion(fromDirectory: string, packageName: string): string | undefined {
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
 * Content-hashes files by absolute path, bounded by {@link HASH_CONCURRENCY}.
 *
 * @param absolutePaths The absolute paths to hash.
 *
 * @returns The content hash of each file, keyed by the absolute path it was read from.
 */
async function hashFileContents(absolutePaths: string[]): Promise<Record<string, FileHash>> {
  if (absolutePaths.length === 0) return {};

  try {
    // getFileHashes joins its directory argument with each file; pass '' so the absolute paths are
    // used as-is, and it returns hashes keyed by those absolute paths.
    return await getFileHashes(absolutePaths, '', HASH_CONCURRENCY);
  } catch (error) {
    // The shared reader rejects with whatever the underlying read produced, which says what went
    // wrong but not which of the N paths it was. Naming the path is what an on-call engineer reads
    // under the Sentry event a manifest-build failure raises.
    throw new Error(`Could not hash ${namePathThatFailed(error, absolutePaths)}: ${error.message}`);
  }
}

/**
 * Names the file a failed read was about. Node's filesystem errors carry the path they opened; an
 * error that carries none can still only have come from these paths, so say so rather than losing
 * the count too.
 *
 * @param error The thrown read failure.
 * @param absolutePaths The paths the read was asked about.
 *
 * @returns The path, or a description of the set it came from.
 */
function namePathThatFailed(error: any, absolutePaths: string[]): string {
  return error?.path ? String(error.path) : `one of the ${absolutePaths.length} files hashed`;
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
