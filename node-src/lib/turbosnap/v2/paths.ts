import path from 'path';

import { Module } from '../../../types';
import { posix } from '../../posix';

// Webpack/rspack concatenate modules and label the combined module with the root file plus a
// ` + N modules` suffix (e.g. `./Button.stories.tsx + 1 modules`). Strip it so the name resolves
// to the root file.
const CONCATENATED_MODULE_SUFFIX = / \+ \d+ modules?$/;

/**
 * Canonical manifest keys are project-root-relative, and in-project paths carry a `./` prefix, so a
 * story file's key is byte-identical to the `importPath` Storybook reports for it. That is what lets
 * the Index write `storyFileHashes` keys straight into `onlyStoryFiles`, where they are matched
 * against story filenames.
 */
const IN_PROJECT_PREFIX = './';

/**
 * Strips a trailing ` + N modules` suffix from a concatenated module's name, leaving the root file.
 *
 * @param statsPath The module name from the stats file.
 *
 * @returns The name without the concatenation suffix.
 */
export function stripConcatenatedModuleSuffix(statsPath: string): string {
  return statsPath.replace(CONCATENATED_MODULE_SUFFIX, '');
}

/**
 * Converts a stats module path into the canonical manifest key: a POSIX path relative to the
 * Storybook project root, prefixed `./` when it lands inside the project. Relative stats paths are
 * first resolved from `statsRoot`, because a builder may name them from the repository root even
 * though manifest keys anchor at the project.
 *
 * Builders spell the same file inconsistently — rspack keys modules by an absolute
 * `nameForCondition` but references importers by a relative `moduleName` — so an absolute path is
 * relativized to reconcile both forms and keep the dependency graph connected. A file outside the
 * project (a hoisted `node_modules`, a sibling monorepo package) keeps its leading `../`. Virtual
 * modules (e.g. Vite's `virtual:` entries) have no on-disk location and are returned unchanged.
 *
 * @param statsPath The module name from the stats file (relative like `./src/x` or absolute).
 * @param projectRoot The absolute Storybook project root to anchor against.
 * @param statsRoot The directory relative stats paths are named from. Defaults to the project root.
 *
 * @returns The canonical project-root-relative POSIX path.
 */
export function normalizeStatsPath(
  statsPath: string,
  projectRoot: string,
  statsRoot = projectRoot
): string {
  if (statsPath.includes('virtual:')) return statsPath;

  const stripped = stripConcatenatedModuleSuffix(statsPath);
  const absolutePath = path.isAbsolute(stripped) ? stripped : path.resolve(statsRoot, stripped);
  return prefixInProjectPath(posix(path.relative(projectRoot, absolutePath)));
}

/**
 * Adds the `./` prefix that marks a path as living inside the project. A path that already escapes
 * the project keeps its leading `../`, which is prefix enough to read.
 *
 * @param relativePath The project-relative POSIX path.
 *
 * @returns The path with an explicit prefix.
 */
function prefixInProjectPath(relativePath: string): string {
  return relativePath.startsWith('../') ? relativePath : `${IN_PROJECT_PREFIX}${relativePath}`;
}

/**
 * Resolves a stats module path to an absolute on-disk path for hashing, anchoring relative paths at
 * the Storybook project root.
 *
 * @param statsPath The module name from the stats file.
 * @param statsRoot The absolute directory relative stats paths are named from.
 *
 * @returns The absolute path to the file on disk.
 */
export function resolveStatsPath(statsPath: string, statsRoot: string): string {
  const stripped = stripConcatenatedModuleSuffix(statsPath).replace(/^\.\//, '');
  return path.isAbsolute(stripped) ? stripped : path.resolve(statsRoot, stripped);
}

/**
 * Returns the real source files a stats module represents, root first. Webpack/rspack concatenate
 * modules and expose the combined files in `module.modules`; a plain module has just its own name.
 * Names that are null/undefined (e.g. externals or entries) are dropped.
 *
 * The root is always the module's own name, never the first entry of `module.modules`. Only the
 * module's own name is guaranteed to spell the file the record stands for: `storybook-builder-rsbuild`
 * 3.3.0/3.3.1 fill `modules` with the record's require-contexts instead of its concatenated files, so
 * reading the root from there yields a glob, which has no file on disk and promotes the whole record
 * to a story importer. The concatenation suffix is stripped from every name so the root does not
 * duplicate a member that spells the same file without it.
 *
 * Deliberately not shared with `statsPaths` in statsAnchor.ts, which enumerates the same stats for a
 * different question. This returns each file *once*, preferring `nameForCondition`, because a second
 * spelling of the same module would become a duplicate graph node; `statsPaths` takes every spelling
 * because it is gathering evidence and only asks whether any one of them witnesses a mismatch.
 *
 * @param module The stats module to read file names from.
 *
 * @returns The module's real file names, or an empty array if it has none.
 */
export function moduleFileNames(module: Module): string[] {
  // rspack puts the real file name in `nameForCondition` then fallback to `name` for the other builders.
  const root = module.nameForCondition ?? module.name;
  const names = [root, ...(module.modules ?? []).map((m) => m.nameForCondition ?? m.name)];
  return [...new Set(names.filter(Boolean).map((name) => stripConcatenatedModuleSuffix(name)))];
}
