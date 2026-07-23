import path from 'path';

import { posix } from '../../posix';

// Webpack/rspack concatenate modules and label the combined module with the root file plus a
// ` + N modules` suffix (e.g. `./Button.stories.tsx + 1 modules`). Strip it so the name resolves
// to the root file.
const CONCATENATED_MODULE_SUFFIX = / \+ \d+ modules?$/;

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
 * Converts a stats module path into a canonical POSIX path relative to the Storybook project root,
 * so a file keeps the same identity when the project moves within the repository. Virtual modules
 * (e.g. Vite's `virtual:` entries) have no on-disk location and are returned unchanged.
 *
 * @param statsPath The module name from the stats file (relative like `./src/x` or absolute).
 * @param projectRoot The absolute Storybook project root to anchor against.
 *
 * @returns The canonical project-relative POSIX path.
 */
export function normalizeStatsPath(statsPath: string, projectRoot: string): string {
  if (statsPath.includes('virtual:')) return statsPath;

  const stripped = stripConcatenatedModuleSuffix(statsPath).replace(/^\.\//, '');
  return path.isAbsolute(stripped) ? posix(path.relative(projectRoot, stripped)) : posix(stripped);
}

/**
 * Resolves a stats module path to an absolute on-disk path for hashing, anchoring relative paths at
 * the Storybook project root.
 *
 * @param statsPath The module name from the stats file.
 * @param projectRoot The absolute Storybook project root to anchor against.
 *
 * @returns The absolute path to the file on disk.
 */
export function resolveStatsPath(statsPath: string, projectRoot: string): string {
  const stripped = stripConcatenatedModuleSuffix(statsPath).replace(/^\.\//, '');
  return path.isAbsolute(stripped) ? stripped : path.resolve(projectRoot, stripped);
}
