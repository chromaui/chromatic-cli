import path from 'path';

import { posix } from '../../posix';

// Webpack/rspack concatenate modules and label the combined module with the root file plus a
// ` + N modules` suffix (e.g. `./Button.stories.tsx + 1 modules`). Strip it so the name resolves
// to the root file.
const CONCATENATED_MODULE_SUFFIX = / \+ \d+ modules?$/;

/**
 * The two roots a stats path is anchored against, and the single explanation of why they differ.
 *
 * A stats path plays two roles, so we resolve it against two different roots:
 *
 * - `projectRoot` locates the file on disk. Relative stats paths are relative to the Storybook
 *   project root, so that is where we read files from to hash them.
 * - `gitRoot` names the file in the manifest. The canonical manifest key is made relative to the
 *   git repository root so the key names where the file lives in the repo (e.g.
 *   `packages/shared/index.js` rather than `../../shared/index.js`).
 *
 * When the repo root is unknown, callers fall back to `gitRoot === projectRoot`, keeping keys
 * project-relative.
 */
export interface StatsPathRoots {
  /** Absolute Storybook project root; relative stats paths and on-disk reads anchor here. */
  projectRoot: string;
  /** Absolute git repository root; canonical manifest keys are made relative to it. */
  gitRoot: string;
}

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
 * Converts a stats module path into the canonical manifest key: a POSIX path relative to the git
 * repository root (see {@link StatsPathRoots} for why paths anchor at the git root). Builders spell
 * the same file inconsistently — rspack keys modules by an absolute `nameForCondition` but
 * references importers by a relative `moduleName`, so we resolve to an absolute path first and
 * relativize once, reconciling both forms so the dependency graph connects. Virtual modules (e.g.
 * Vite's `virtual:` entries) have no on-disk location and are returned unchanged.
 *
 * @param statsPath The module name from the stats file (relative like `./src/x` or absolute).
 * @param roots The project and git roots to anchor against; see {@link StatsPathRoots}.
 *
 * @returns The canonical git-root-relative POSIX path.
 */
export function normalizeStatsPath(statsPath: string, roots: StatsPathRoots): string {
  if (statsPath.includes('virtual:')) return statsPath;

  return posix(path.relative(roots.gitRoot, resolveStatsPath(statsPath, roots.projectRoot)));
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
