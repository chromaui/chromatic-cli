import { readdir, realpath, stat } from 'fs/promises';
import path from 'path';

import { getFileHashes } from '../../getFileHashes';
import { FileHash, FilePath, rollUpEntryHashes } from './graph';
import { normalizeStatsPath } from './paths';

// The synthetic `storybookFiles` keys covering Storybook inputs that are never bundler inputs, so no
// module hash can see them change. Angle brackets can't appear in a canonical relative path, so
// neither can collide with a real file.
//
// `package.json` and lockfiles deliberately do not belong here, even though they are also not modules.
// v1 diffed them only to derive changed package *names*; v2 content-hashes the installed files that are
// in the graph, which covers a dependency change more precisely. Hashing manifest bytes on top would
// recapture everything on lockfile churn that v1 correctly captures nothing for.
export const STORYBOOK_CONFIG_KEY = '<storybookConfig>';
export const STATIC_FILES_KEY = '<staticFiles>';

/** Where to look for the out-of-graph inputs. Both are project-root-relative, as they arrive on `ctx.storybook`. */
export interface OutOfGraphInput {
  /** The Storybook config directory, e.g. `.storybook`. */
  configDir: string;
  /** The configured static directories, e.g. `['.storybook/static']`. Empty when unset. */
  staticDirs: string[];
}

/**
 * The content hash of every out-of-graph file, keyed by canonical manifest path. These are the S3-only
 * debug detail sections behind the {@link STORYBOOK_CONFIG_KEY} and {@link STATIC_FILES_KEY} roll-ups:
 * the Index does one equality check per roll-up, and the debug view diffs these to name the file that
 * actually moved.
 */
export interface OutOfGraphFiles {
  storybookConfigFiles: Map<FilePath, FileHash>;
  staticFiles: Map<FilePath, FileHash>;
}

/**
 * Content-hashes every file in the Storybook config directory and every file in the configured static
 * directories.
 *
 * These files are structurally invisible to v2's graph hashing — `.storybook/main.ts` is Node-side
 * config and static assets are referenced by URL string, so neither is ever a module in
 * `preview-stats.json`. Without this, an edit to either produces a byte-identical manifest, where
 * TurboSnap v1 bails and recaptures everything. Hashing bytes off disk covers them regardless of
 * whether the builder emitted a module, which is also what closes the empty-`preview.ts` case (a
 * 0-line preview is elided by vite, so it has no graph-rolled entry at all).
 *
 * We hash bytes rather than following imports. A change to a file that `main.ts` imports from outside
 * the config directory is missed — and missed by v1 too, so it is parity — while following those
 * imports would mean resolving and interpreting Node-side config, which is out of scope.
 *
 * Static files are hashed unbounded, with no size or count cap: a cap is a silent gap, which is the
 * failure mode this mechanism exists to remove.
 *
 * @param input Where to look; see {@link OutOfGraphInput}.
 * @param projectRoot The absolute Storybook project root used to locate files and name them.
 *
 * @returns The content hash of every config file and every static file, keyed by canonical manifest
 * path.
 */
export async function hashOutOfGraphFiles(
  input: OutOfGraphInput,
  projectRoot: string
): Promise<OutOfGraphFiles> {
  const staticDirectories = input.staticDirs.map((directory) =>
    path.resolve(projectRoot, directory)
  );

  const [configPaths, staticPaths] = await Promise.all([
    listFilesRecursively(path.resolve(projectRoot, input.configDir)),
    // A file can only belong to one section, so collect the static directories first and let them win
    // below. All the fixtures nest `.storybook/static/`, and v1 tests `isStaticFile` before
    // `isStorybookFile` for exactly that reason (getDependentStoryFiles.ts:284-292).
    Promise.all(staticDirectories.map((directory) => listFilesRecursively(directory))),
  ]);

  const staticFilePaths = staticPaths.flat();
  const staticFileSet = new Set(staticFilePaths);

  return {
    storybookConfigFiles: await hashByManifestPath(
      configPaths.filter((filePath) => !staticFileSet.has(filePath)),
      projectRoot
    ),
    staticFiles: await hashByManifestPath(staticFilePaths, projectRoot),
  };
}

/**
 * Rolls each out-of-graph section up into the single `storybookFiles` entry the Index compares.
 *
 * The two sections are deliberately independent of each other and of `.storybook/preview.*`'s
 * graph-rolled entry: bytes-changed and imports-changed are different failure modes, so `preview.*` is
 * covered twice on purpose and neither entry has to be complete alone.
 *
 * A section with no files contributes no entry at all, matching how the `<storybookGlobals>` catch-all
 * is omitted when empty.
 *
 * Both roll-ups are path-sensitive, as the graph-rolled entries now are too: a static asset is served
 * at its path and a config file is loaded by name, so a byte-preserving rename changes what Storybook
 * renders even though the multiset of contents is untouched. The path identity hashed is the
 * canonical manifest key, which is project-relative — so a project move leaves both roll-ups still,
 * the assets being served at the same URLs and the config still loading from the same names, and only
 * a rename *within* the project is a real change.
 *
 * @param outOfGraphFiles The per-file hashes to roll up.
 * @param h64ToString The hash function.
 *
 * @returns The synthetic `storybookFiles` entries, keyed by {@link STORYBOOK_CONFIG_KEY} and
 * {@link STATIC_FILES_KEY}.
 */
export function rollUpOutOfGraphFiles(
  outOfGraphFiles: OutOfGraphFiles,
  h64ToString: (input: string) => string
): Map<FilePath, FileHash> {
  const sections = [
    [STORYBOOK_CONFIG_KEY, outOfGraphFiles.storybookConfigFiles],
    [STATIC_FILES_KEY, outOfGraphFiles.staticFiles],
  ] as const;

  return new Map(
    sections
      .filter(([, files]) => files.size > 0)
      .map(([key, files]) => [key, rollUpEntryHashes([...files], h64ToString)])
  );
}

/**
 * Hashes absolute file paths and keys the result by canonical manifest path, matching how `files` is
 * keyed so a manifest reader can compare the two.
 *
 * @param absolutePaths The absolute paths to hash.
 * @param projectRoot The absolute Storybook project root canonical keys are relative to.
 *
 * @returns The content hash per canonical manifest path.
 */
async function hashByManifestPath(
  absolutePaths: string[],
  projectRoot: string
): Promise<Map<FilePath, FileHash>> {
  if (absolutePaths.length === 0) return new Map();

  // getFileHashes joins its directory argument with each file; pass '' so the absolute paths are
  // used as-is, and it returns hashes keyed by those absolute paths.
  const hashes = await getFileHashes(absolutePaths, '', 10);

  return new Map(
    absolutePaths
      .map((absolutePath): [FilePath, FileHash] => [
        normalizeStatsPath(absolutePath, projectRoot),
        hashes[absolutePath],
      ])
      // Sorted so the debug detail section reads in path order rather than directory-walk order.
      .sort(([a], [b]) => a.localeCompare(b))
  );
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
