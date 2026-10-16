import path from 'path';

import { AbsolutePath, Module } from '../../../types';
import { relativeTo } from '../../getStorybookProjectRoot';
import { matchesFile } from '../../utilities';
import { FilePath } from './graph';

/**
 * The source file names a stats module stands for, root first. Webpack/rspack concatenate modules
 * and expose the combined files in `module.modules`; a plain module names only itself.
 *
 * The root is always the module's own name, never the first entry of `module.modules`: only the own
 * name is guaranteed to spell the file the record stands for. `storybook-builder-rsbuild` 3.3.0/3.3.1
 * fills `modules` with the record's require-contexts instead of its concatenated files, so reading the
 * root from there yields a glob — which has no file on disk and would promote the whole record to a
 * story importer. webpack and rspack both carry the real (absolute) source path in `nameForCondition`,
 * so it is preferred over `name`. The concatenation suffix is stripped from every name and duplicates
 * are dropped, so the root never duplicates a member that spells the same file without it.
 *
 * @param module The stats module to read the file names of.
 *
 * @returns The source file names, root first, with empty entries and duplicates dropped.
 */
export function moduleFileNames(module: Module): FilePath[] {
  const root = module.nameForCondition ?? module.name;
  const names = [
    root,
    ...(module.modules ?? []).map((inner) => inner.nameForCondition ?? inner.name),
  ];
  return [...new Set(names.filter(Boolean).map((name) => stripConcatenatedModuleSuffix(name)))];
}

/**
 * The two roots that anchor a stats module path. They always travel together through
 * canonicalization: {@link normalizeStatsPath} resolves a relative stats path from `statsRoot`, then
 * names it relative to `projectRoot`.
 */
export interface StatsRoots {
  /** The absolute Storybook project root that canonical manifest keys are relative to. */
  projectRoot: AbsolutePath;
  /** The absolute directory relative stats paths are named from. */
  statsRoot: AbsolutePath;
}

/**
 * The canonical paths of a stats module's source files: its {@link moduleFileNames}, each normalized,
 * root first. The single place the "canonical file names" rule lives, so every walk over
 * `stats.modules` reads the same definition.
 *
 * @param module The stats module.
 * @param roots The roots to anchor against. See {@link StatsRoots}.
 *
 * @returns The canonical file paths, root first, with empty entries and duplicates dropped.
 */
export function canonicalFileNames(module: Module, roots: StatsRoots): FilePath[] {
  return moduleFileNames(module).map((name) =>
    normalizeStatsPath(name, roots.projectRoot, roots.statsRoot)
  );
}

/**
 * The canonical paths that import a stats module: its `reasons` mapped to `moduleName`, entry reasons
 * (null `moduleName`) dropped, each normalized. The single place the "canonical importers" rule lives,
 * so `readStatsGraph` and story detection cannot drift apart.
 *
 * @param module The stats module.
 * @param roots The roots to anchor against. See {@link StatsRoots}.
 *
 * @returns The canonical importer paths.
 */
export function canonicalImporters(module: Module, roots: StatsRoots): FilePath[] {
  return (module.reasons ?? [])
    .map((reason) => reason.moduleName)
    .filter((name): name is FilePath => typeof name === 'string')
    .map((name) => normalizeStatsPath(name, roots.projectRoot, roots.statsRoot));
}

/**
 * The canonical path of a stats module's root source file: the first of its {@link canonicalFileNames}.
 * Only the root identifies the module and matches it against importers; the other inner names of a
 * concatenation group are its descendants.
 *
 * @param module The stats module.
 * @param roots The roots to anchor against. See {@link StatsRoots}.
 *
 * @returns The canonical root path, or undefined when the module names no files.
 */
export function rootFilePath(module: Module, roots: StatsRoots): FilePath | undefined {
  return canonicalFileNames(module, roots)[0];
}

// A `node_modules` segment anywhere in a path. Matched segment-wise rather than by substring so a
// file merely named `node_modules` is not mistaken for one inside the directory. Tolerant of both
// separators and of the segment being terminal, so it reads raw stats names (Windows backslashes)
// and canonical keys alike.
const NODE_MODULES_SEGMENT = /(?:^|[\\/])node_modules(?:[\\/]|$)/;

/**
 * Whether a path passes through a `node_modules` directory.
 *
 * @param filePath The path to test, raw or canonical.
 *
 * @returns Whether the path contains a `node_modules` segment.
 */
export function isNodeModulesPath(filePath: string): boolean {
  return NODE_MODULES_SEGMENT.test(filePath);
}

// A Rollup proxy id: a NUL byte before the id of a module a builder created to stand for a real
// file (CommonJS interop, framework SFC blocks). Only a proxy for a relative path names a file.
const NUL = '\0';
const FOLDABLE_NUL_PREFIXES = [`${NUL}./`, `${NUL}../`];

// Webpack spells a require-context ` lazy ` or ` sync `; rspack delimits the same markers with
// pipes. A context name is a glob expression rather than a file path, so its `?` starts no query.
const CONTEXT_MARKER = / lazy | sync |\|lazy\||\|sync\|/;

/**
 * Whether a file path names a synthetic module whose contents do not exist as a file on disk.
 *
 * @param path The module name from the stats file.
 *
 * @returns Whether the path must not be resolved or read from disk.
 */
export function isSyntheticFile(path: FilePath): boolean {
  // Note: The file path of the data: "files" start with `data:image/svg+xml` or similar rather than
  // a directory path.
  if (path.includes('virtual:') || path.startsWith('data:')) {
    return true;
  }

  // A NUL proxy for a relative path folds onto that file (see {@link fileStoodForById}); any other
  // leading NUL — a bare runtime helper like `\0commonjsHelpers.js` or an opaque rooted id like
  // `\0/@data-uri/...` — names nothing on disk. Asked on the raw id: stripping would remove the NUL.
  return path.startsWith(NUL) && !FOLDABLE_NUL_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * Strips a trailing ` + N modules` suffix from a concatenated module's name, leaving the root file.
 *
 * @param statsPath The module name from the stats file.
 *
 * @returns The name without the concatenation suffix.
 */
export function stripConcatenatedModuleSuffix(statsPath: FilePath): FilePath {
  return statsPath.replace(/ \+ \d+ modules?$/, '');
}

/**
 * Converts a stats module path into the canonical manifest key: a POSIX path relative to the
 * Storybook project root. Relative stats paths are first resolved from `statsRoot`, because a
 * builder may name them from the repository root even though manifest keys anchor at the project.
 * Proxy and query ids are folded onto the file they stand for first; see {@link fileStoodForById}.
 * Synthetic modules (e.g. Vite's `virtual:` entries, inline `data:` URLs and bare Rollup proxies)
 * have no on-disk location and are returned unchanged.
 *
 * @param statsPath The module name from the stats file (relative like `./src/x` or absolute).
 * @param projectRoot The absolute Storybook project root to anchor against.
 * @param statsRoot The directory relative stats paths are named from. Defaults to the project root.
 *
 * @returns The canonical project-root-relative POSIX path.
 */
export function normalizeStatsPath(
  statsPath: FilePath,
  projectRoot: AbsolutePath,
  statsRoot: AbsolutePath = projectRoot
): FilePath {
  if (isSyntheticFile(statsPath)) {
    return statsPath;
  }

  return prefixInProjectPath(relativeTo(projectRoot, resolveStatsPath(statsPath, statsRoot)));
}

/**
 * Adds the `./` prefix that marks a path as living inside the project. A path that already escapes
 * the project keeps its leading `../`, which is prefix enough to read.
 *
 * @param relativePath The project-relative POSIX path.
 *
 * @returns The path with an explicit prefix.
 */
function prefixInProjectPath(relativePath: FilePath): FilePath {
  return relativePath.startsWith('../') ? relativePath : `./${relativePath}`;
}

/**
 * The file a stats id stands for. Rollup reads one real file under several ids: the plain path, a
 * NUL-prefixed proxy for CommonJS interop and framework blocks (`\0./x.js?commonjs-module`), and
 * the plain path with a builder query (`./src/Foo.vue?vue&type=script`). Folding every spelling
 * onto the one file is what lets V2 key a module and its edges the way V1 reads the id.
 *
 * Synthetic ids must already be classified away with {@link isSyntheticFile} — both consumers do,
 * because stripping a synthetic id's NUL here would invent a phantom path on disk.
 *
 * @param statsPath The module name from the stats file.
 *
 * @returns The path of the file the id stands for.
 */
function fileStoodForById(statsPath: FilePath): FilePath {
  // A NUL proxy for a relative path stands for that path, without the NUL or the query.
  const unproxied = statsPath.startsWith(NUL) ? statsPath.slice(NUL.length) : statsPath;
  return stripQuery(unproxied);
}

/**
 * Strips a builder's query from a stats id, leaving the file named. Vite suffixes the ids of the
 * module blocks and CommonJS interop files it extracts; the query is the builder's, not the file's.
 * A `?` survives when the name is not a plain file query: a loader chain reads up to `!`, so
 * stripping would hash the loader instead of the loaded file, and a require-context name is a glob
 * expression rather than a file.
 *
 * @param statsPath The module name from the stats file.
 *
 * @returns The file name without the query, or the name unchanged when its `?` must survive.
 */
function stripQuery(statsPath: FilePath): FilePath {
  const queryStart = statsPath.indexOf('?');
  if (queryStart === -1) {
    return statsPath;
  }
  if (statsPath.includes('!') || CONTEXT_MARKER.test(statsPath)) {
    return statsPath;
  }
  return statsPath.slice(0, queryStart);
}

/**
 * Resolves a stats module path to an absolute on-disk path for hashing, anchoring relative paths at
 * the Storybook project root. The id is folded onto the file it stands for first; see
 * {@link fileStoodForById}. Escape markers are removed after that; see {@link stripNullBytes}.
 *
 * @param statsPath The module name from the stats file.
 * @param statsRoot The absolute directory relative stats paths are named from.
 *
 * @returns The absolute path to the file on disk.
 */
export function resolveStatsPath(statsPath: FilePath, statsRoot: AbsolutePath): AbsolutePath {
  const stoodFor = fileStoodForById(statsPath);
  const stripped = stripNullBytes(stripConcatenatedModuleSuffix(stoodFor));
  return path.isAbsolute(stripped) ? stripped : path.resolve(statsRoot, stripped);
}

/**
 * Removes the NUL bytes webpack uses to escape a path (`#` is `\0#`), leaving the name the file has
 * on disk.
 *
 * @param statsPath The module name from the stats file.
 *
 * @returns The name with the escape markers removed.
 */
function stripNullBytes(statsPath: FilePath): FilePath {
  return statsPath.replaceAll('\0', '');
}

/**
 * Builds the check for whether a file matches one of the user's globs, as `--externals` and
 * `--untraced` name them. A glob is matched against the git-root-relative posix path with the same
 * matcher v1 uses on its changed files, so a glob means the same thing to both generations. An empty
 * glob names nothing, so it is ignored here rather than by every caller: picomatch rejects an empty
 * pattern, and one can arrive from an empty flag value or a configuration file entry.
 *
 * @param gitRoot The absolute repository root the globs are relative to.
 * @param globs The user's globs.
 *
 * @returns The check, by absolute path.
 */
export function gitRootGlobMatcher(
  gitRoot: AbsolutePath,
  globs: string[]
): (absolutePath: AbsolutePath) => boolean {
  const patterns = globs.filter(Boolean);
  return (absolutePath) => {
    const gitRelativePath = relativeTo(gitRoot, absolutePath);
    return patterns.some((glob) => matchesFile(glob, gitRelativePath));
  };
}
