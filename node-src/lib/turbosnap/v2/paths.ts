import path from 'path';

import { AbsolutePath, Module, Reason, Stats } from '../../../types';
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
 * The source file of every webpack/rspack module record, top-level and concatenated inner alike,
 * keyed by its exact `identifier`. Built once per stats file so {@link reasonImporter} can name the
 * member a reason's `resolvedModuleIdentifier` points at.
 */
export type ModuleSources = ReadonlyMap<string, FilePath>;

/**
 * Indexes the source file behind every module identifier in the stats; see {@link ModuleSources}.
 * Identifiers are matched exactly rather than parsed: they carry loader chains, queries and
 * require-context regexes whose syntax differs between bundlers. A record without a
 * `nameForCondition` (a require-context, an external) has no source file and is left out, so its
 * reasons keep the name fallback.
 *
 * @param stats The stats file to index.
 *
 * @returns The source file of each module identifier.
 */
export function indexModuleSources(stats: Stats): ModuleSources {
  const sources = new Map<string, FilePath>();
  for (const module of stats.modules) {
    for (const record of [module, ...(module.modules ?? [])]) {
      if (record.identifier && record.nameForCondition) {
        sources.set(record.identifier, record.nameForCondition);
      }
    }
  }
  return sources;
}

/**
 * The two roots that anchor a stats module path plus the module-source index reason attribution
 * reads. Paths that only normalize take the roots alone ({@link StatsRoots}); reading a reason
 * needs the naming too, so the index travels with the roots wherever attribution goes.
 */
export interface StatsNaming extends StatsRoots {
  /** The source files of the stats module identifiers; see {@link indexModuleSources}. */
  moduleSources: ModuleSources;
}

/**
 * The module a stats reason attributes its import to. Webpack/rspack report the merged group as
 * `moduleName`, so the member that contains the import is read from `resolvedModuleIdentifier`
 * first: rspack spells the group in `resolvedModule` too, and only the identifier names the member
 * in both bundlers. Then `resolvedModule` (webpack's member name, or a require-context the index
 * leaves out), then `moduleName` (Vite emits neither field).
 *
 * @param reason The stats reason.
 * @param sources The source files of the stats module identifiers; see {@link indexModuleSources}.
 *
 * @returns The name of the module the import belongs to, or null for an entry reason.
 */
export function reasonImporter(reason: Reason, sources: ModuleSources): string | null {
  const resolved = reason.resolvedModuleIdentifier
    ? sources.get(reason.resolvedModuleIdentifier)
    : undefined;
  return resolved ?? reason.resolvedModule ?? reason.moduleName;
}

/**
 * The canonical path a stats reason attributes its import to: {@link reasonImporter} — the member
 * the stats name for the origin module, else the `moduleName` it blames — normalized against the
 * naming roots, or undefined for an entry reason. The single home of the canonical-importer rule,
 * so `readStatsGraph` and story detection cannot drift apart.
 *
 * @param reason The stats reason.
 * @param naming The roots and module sources to canonicalize against. See {@link StatsNaming}.
 *
 * @returns The canonical importer path, or undefined when the reason names no importer.
 */
export function canonicalReasonImporter(reason: Reason, naming: StatsNaming): FilePath | undefined {
  const name = reasonImporter(reason, naming.moduleSources);
  return typeof name === 'string'
    ? normalizeStatsPath(name, naming.projectRoot, naming.statsRoot)
    : undefined;
}

/**
 * The canonical paths that import a stats module: its `reasons` mapped through
 * {@link canonicalReasonImporter}, entry reasons (no importer) dropped.
 *
 * @param module The stats module.
 * @param naming The roots and module sources to canonicalize against. See {@link StatsNaming}.
 *
 * @returns The canonical importer paths.
 */
export function canonicalImporters(module: Module, naming: StatsNaming): FilePath[] {
  return (module.reasons ?? [])
    .map((reason) => canonicalReasonImporter(reason, naming))
    .filter((name): name is FilePath => typeof name === 'string');
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
  return path.includes('virtual:') || path.startsWith('data:');
}

// A webpack/rspack concatenation group's name: the root file followed by ` + N modules`. The one
// home of that spelling, shared by stripping and evidence checking.
const CONCATENATED_MODULE_NAME = / \+ \d+ modules?$/;

/**
 * Strips a trailing ` + N modules` suffix from a concatenated module's name, leaving the root file.
 *
 * @param statsPath The module name from the stats file.
 *
 * @returns The name without the concatenation suffix.
 */
export function stripConcatenatedModuleSuffix(statsPath: FilePath): FilePath {
  return statsPath.replace(CONCATENATED_MODULE_NAME, '');
}

/**
 * Whether a stats module name spells a concatenation group: the root file followed by
 * ` + N modules`. Only such a name is evidence that the module it names contains a reason's
 * importer; any other spelling of the same module (a resource query, a loader chain) is how that
 * one import was requested. See {@link stripConcatenatedModuleSuffix} for the shared pattern.
 *
 * @param name The module name from the stats file.
 *
 * @returns Whether the name names a concatenation group.
 */
export function isConcatenatedModuleName(name: string): boolean {
  return CONCATENATED_MODULE_NAME.test(name);
}

/**
 * Converts a stats module path into the canonical manifest key: a POSIX path relative to the
 * Storybook project root. Relative stats paths are first resolved from `statsRoot`, because a
 * builder may name them from the repository root even though manifest keys anchor at the project.
 * Synthetic modules (e.g. Vite's `virtual:` entries and inline `data:` URLs) have no on-disk
 * location and are returned unchanged.
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
 * Resolves a stats module path to an absolute on-disk path for hashing, anchoring relative paths at
 * the Storybook project root. Escape markers are removed first; see {@link stripNullBytes}.
 *
 * @param statsPath The module name from the stats file.
 * @param statsRoot The absolute directory relative stats paths are named from.
 *
 * @returns The absolute path to the file on disk.
 */
export function resolveStatsPath(statsPath: FilePath, statsRoot: AbsolutePath): AbsolutePath {
  const stripped = stripNullBytes(stripConcatenatedModuleSuffix(statsPath));
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
