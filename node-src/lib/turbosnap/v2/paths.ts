import path from 'path';

import { AbsolutePath, Module } from '../../../types';
import { relativeTo } from '../../getStorybookProjectRoot';
import { FilePath } from './graph';

/**
 * The source file names a stats module stands for. A concatenated module's `name` is a group label
 * (e.g. `./x.stories.tsx + 1 modules`), so its real files are read from the inner `modules`; a
 * plain module names itself.
 *
 * webpack and rspack both carry the real (absolute) source path in `nameForCondition`, so it is
 * preferred over `name` where present.
 *
 * @param module The stats module to read the file names of.
 *
 * @returns The source file names, with empty entries dropped.
 */
export function moduleFileNames(module: Module): FilePath[] {
  const names = module.modules?.length
    ? module.modules.map((inner) => inner.nameForCondition ?? inner.name)
    : [module.nameForCondition ?? module.name];
  return names.filter(Boolean);
}

/**
 * The canonical path of a stats module's root source file: the first of its {@link moduleFileNames},
 * normalized. Only the root identifies the module and matches it against importers; the other inner
 * names of a concatenation group are its descendants.
 *
 * @param module The stats module.
 * @param projectRoot The absolute Storybook project root to anchor against.
 * @param statsRoot The directory relative stats paths are named from.
 *
 * @returns The canonical root path, or undefined when the module names no files.
 */
export function rootFilePath(
  module: Module,
  projectRoot: AbsolutePath,
  statsRoot: AbsolutePath
): FilePath | undefined {
  const [rootName] = moduleFileNames(module);
  return rootName === undefined ? undefined : normalizeStatsPath(rootName, projectRoot, statsRoot);
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
 * Virtual modules (e.g. Vite's `virtual:` entries) have no on-disk location and are returned
 * unchanged.
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
  if (statsPath.includes('virtual:')) {
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
 * the Storybook project root.
 *
 * @param statsPath The module name from the stats file.
 * @param statsRoot The absolute directory relative stats paths are named from.
 *
 * @returns The absolute path to the file on disk.
 */
export function resolveStatsPath(statsPath: FilePath, statsRoot: AbsolutePath): AbsolutePath {
  const stripped = stripConcatenatedModuleSuffix(statsPath);
  return path.isAbsolute(stripped) ? stripped : path.resolve(statsRoot, stripped);
}
