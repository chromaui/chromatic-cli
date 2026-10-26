import path from 'path';

import { AbsolutePath, Context, Module } from '../../types';
import { posix } from '../posix';

// Helpers that read module paths from a Storybook's stats file, shared by TurboSnap v1 and v2.

// For any path in node_modules, return the package name, including scope prefix if any.
export const getPackageName = (modulePath: string) => {
  const [, scopedName] = modulePath.match(/\/node_modules\/(@[\w-]+\/[\w-]+)\//) || [];
  if (scopedName) return scopedName;
  const [, unscopedName] = modulePath.match(/\/node_modules\/([\w-]+)\//) || [];
  return unscopedName;
};

/**
 * Converts a module path found in the webpack stats to be relative to the (git) root path. Module
 * paths can be relative (`./module.js`) or absolute (`/path/to/project/module.js`). The webpack
 * stats may have been generated in a subdirectory, so relative paths are anchored to the Storybook
 * project root. The result is a relative POSIX path compatible with `git diff --name-only`.
 * Virtual paths (e.g. Vite) are returned as-is.
 *
 * @param filePath The path to the file.
 * @param rootPath The absolute git repository root.
 * @param projectRoot The absolute Storybook project root.
 *
 * @returns A normalized path to the file.
 */
export function normalizePath(
  filePath: string,
  rootPath: AbsolutePath,
  projectRoot: AbsolutePath = rootPath
) {
  if (!filePath || filePath.startsWith('/virtual:')) return filePath;

  const relativePath = path.isAbsolute(filePath)
    ? path.relative(rootPath, filePath)
    : path.join(path.relative(rootPath, projectRoot), filePath);
  return posix(relativePath);
}

/**
 * Converts a module name found in the stats to the repository-relative path of the file it names,
 * comparable to `git diff --name-only` output. Strips the NUL that marks proxies of a relative path
 * and query params such as `?ngResource`. Opaque NUL ids (`\0commonjsHelpers.js`) name no file, so
 * they keep the NUL and can never match a changed file.
 *
 * @param name The module name from the stats.
 * @param rootPath The absolute git repository root.
 * @param projectRoot The absolute Storybook project root, which relative names are relative to.
 *
 * @returns The normalized name.
 */
export function normalizeStatsName(
  name: string,
  rootPath: AbsolutePath,
  projectRoot: AbsolutePath
) {
  const CSF_REGEX = /\s+(sync|lazy)\s+/g;
  const URL_PARAM_REGEX = /(\?.*)/g;
  const unproxied = /^\0\.\.?\//.test(name) ? name.slice(1) : name;
  const newPath = normalizePath(unproxied, rootPath, projectRoot);
  return URL_PARAM_REGEX.test(newPath) && !CSF_REGEX.test(newPath)
    ? newPath.replaceAll(URL_PARAM_REGEX, '')
    : newPath;
}

/**
 * The Storybook project root that relative stats paths are relative to.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns The absolute project root.
 */
export const getStatsProjectRoot = (ctx: Context): AbsolutePath =>
  ctx.storybook?.projectRoot ?? process.cwd();

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
export function moduleFileNames(module: Module): string[] {
  const root = module.nameForCondition ?? module.name;
  const names = [
    root,
    ...(module.modules ?? []).map((inner) => inner.nameForCondition ?? inner.name),
  ];
  return [...new Set(names.filter(Boolean).map((name) => stripConcatenatedModuleSuffix(name)))];
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
 * Strips a trailing ` + N modules` suffix from a concatenated module's name, leaving the root file.
 *
 * @param statsPath The module name from the stats file.
 *
 * @returns The name without the concatenation suffix.
 */
export function stripConcatenatedModuleSuffix(statsPath: string): string {
  return statsPath.replace(/ \+ \d+ modules?$/, '');
}
