import path from 'path';

import { AbsolutePath, Context } from '../../../types';
import { posix } from '../../posix';

// Helpers that read module paths from a Storybook's stats file, shared by the tracer and by the
// dependency scoping that runs before it.

// For any path in node_modules, return the package name, including scope prefix if any.
export const getPackageName = (modulePath: string) => {
  const [, scopedName] = modulePath.match(/\/node_modules\/(@[\w-]+\/[\w-]+)\//) || [];
  if (scopedName) return scopedName;
  const [, unscopedName] = modulePath.match(/\/node_modules\/([\w-]+)\//) || [];
  return unscopedName;
};

/**
 * Finds the installed copy a module belongs to: the last `node_modules/<name>` directory of the
 * package `getPackageName` names in its path. Copies nested inside that package's own
 * `node_modules` belong to it too.
 *
 * @param filePath The normalized module path.
 * @param packageName The package name `getPackageName` returns for the module.
 *
 * @returns The `node_modules/<name>` directory, or `undefined` when the path doesn't contain one.
 */
export const getPackageDirectory = (filePath: string, packageName: string) => {
  const marker = `node_modules/${packageName}/`;
  const markerIndex = filePath.lastIndexOf(marker);
  return markerIndex === -1 ? undefined : filePath.slice(0, markerIndex + marker.length - 1);
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
 * Reads the version of an installed package from its path, for package managers that put it there:
 * pnpm's store (`.pnpm/react@19.0.1_<peers>/node_modules/react`) and Yarn PnP's cache
 * (`.yarn/cache/react-npm-19.0.1-<hash>.zip/node_modules/react`).
 *
 * @param directory The package's `node_modules/<name>` directory, as found in the stats.
 * @param name The package name.
 *
 * @returns The version, or `undefined` when the path doesn't carry one.
 */
export function getVersionFromPath(directory: string, name: string) {
  const parent = directory.split('/').at(-name.split('/').length - 2) ?? '';

  const pnpmPrefix = `${name.replace('/', '+')}@`;
  if (/(^|\/)\.pnpm\//.test(directory) && parent.startsWith(pnpmPrefix)) {
    return parent.slice(pnpmPrefix.length).split(/[_(]/)[0] || undefined;
  }

  const yarnPrefix = `${name.replace('/', '-')}-npm-`;
  if (/(^|\/)\.yarn\//.test(directory) && parent.startsWith(yarnPrefix)) {
    const [, version] = parent.match(/-npm-(.+?)-[\da-f]{10}(?:-[\da-f]+)?(?:\.zip)?$/) || [];
    return version;
  }
  return undefined;
}
