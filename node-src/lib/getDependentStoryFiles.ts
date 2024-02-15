import path from 'path';

import { isPackageManifestFile, matchesFile } from './utils';
import { getRepositoryRoot } from '../git/git';
import bailFile from '../ui/messages/warnings/bailFile';
import noCSFGlobs from '../ui/messages/errors/noCSFGlobs';
import tracedAffectedFiles from '../ui/messages/info/tracedAffectedFiles';
import { Context, Module, Reason, Stats } from '../types';

type FilePath = string;
type NormalizedName = string;

// Bail whenever one of these was changed
const LOCKFILES = [
  /^package-lock\.json$/,
  /^yarn\.lock$/,
  /\/package-lock\.json$/,
  /\/yarn\.lock$/,
];

// Ignore these while tracing dependencies
const INTERNALS = [/\/webpack\/runtime\//, /^\(webpack\)/];

const isPackageLockFile = (name: string) => LOCKFILES.some((re) => re.test(name));
const isUserModule = (mod: Module | Reason) =>
  (mod as Module).id !== undefined &&
  (mod as Module).id !== null &&
  !INTERNALS.some((re) => re.test((mod as Module).name || (mod as Reason).moduleName));

// Replaces Windows-style backslash path separators with POSIX-style forward slashes, because the
// Webpack stats use forward slashes in the `name` and `moduleName` fields. Note `changedFiles`
// already contains forward slashes, because that's what git yields even on Windows.
const posix = (localPath: string) => localPath.split(path.sep).filter(Boolean).join(path.posix.sep);

// For any path in node_modules, return the package name, including scope prefix if any.
const getPackageName = (modulePath: string) => {
  const [, scopedName] = modulePath.match(/\/node_modules\/(@[\w-]+\/[\w-]+)\//) || [];
  if (scopedName) return scopedName;
  const [, unscopedName] = modulePath.match(/\/node_modules\/([\w-]+)\//) || [];
  return unscopedName;
};

/**
 * Converts a module path found in the webpack stats to be relative to the (git) root path. Module
 * paths can be relative (`./module.js`) or absolute (`/path/to/project/module.js`). The webpack
 * stats may have been generated in a subdirectory, so we prepend the baseDir if necessary.
 * The result is a relative POSIX path compatible with `git diff --name-only`.
 * Virtual paths (e.g. Vite) are returned as-is.
 */
export function normalizePath(posixPath: string, rootPath: string, baseDir = '') {
  if (!posixPath || posixPath.startsWith('/virtual:')) return posixPath;
  return path.posix.isAbsolute(posixPath)
    ? path.posix.relative(rootPath, posixPath)
    : path.posix.join(baseDir, posixPath);
}

/**
 * This traverses the webpack module stats to retrieve a set of CSF files that somehow trace back to
 * the changed git files. The result is a map of Module ID => file path. In the end we'll only send
 * the Module IDs to Chromatic, the file paths are only for logging purposes.
 */
export async function getDependentStoryFiles(
  ctx: Context,
  stats: Stats,
  statsPath: string,
  changedFiles: string[],
  changedDependencies: string[] = []
) {
  const { configDir = '.storybook', staticDir = [], viewLayer } = ctx.storybook || {};
  const {
    storybookBuildDir,
    storybookBaseDir,
    storybookConfigDir = configDir,
    untraced = [],
  } = ctx.options;

  const rootPath = await getRepositoryRoot(); // e.g. `/path/to/project` (always absolute posix)
  const baseDir = storybookBaseDir ? posix(storybookBaseDir) : path.posix.relative(rootPath, '');

  // Convert a "webpack path" (relative to storybookBaseDir) to a "git path" (relative to repository root)
  // e.g. `./src/file.js` => `path/to/storybook/src/file.js`
  const normalize = (posixPath: FilePath): NormalizedName => {
    const CSF_REGEX = /\s+sync\s+/g;
    const URL_PARAM_REGEX = /(\?.*)/g;
    const newPath = normalizePath(posixPath, rootPath, baseDir);
    // Trim query params such as `?ngResource` which are sometimes present
    return URL_PARAM_REGEX.test(newPath) && !CSF_REGEX.test(newPath)
      ? newPath.replace(URL_PARAM_REGEX, '')
      : newPath;
  };

  const storybookDir = normalize(posix(storybookConfigDir));
  const staticDirs = staticDir.map((dir: string) => normalize(posix(dir)));

  ctx.log.debug('BASE Directory:', baseDir);
  ctx.log.debug('Storybook CONFIG Directory:', storybookDir);

  // NOTE: this only works with `main:stories` -- if stories are imported from files in `.storybook/preview.js`
  // we'll need a different approach to figure out CSF files (maybe the user should pass a glob?).
  const storiesEntryFiles = [
    // v6 store (SB <= 6.3)
    `${storybookConfigDir}/generated-stories-entry.js`,
    // v6 store (SB 6.4 or SB <= 6.3 with root as config dir)
    `./generated-stories-entry.js`,
    // v6 store with .cjs extension (SB 6.5)
    `./generated-stories-entry.cjs`,
    // v7 store (SB >= 6.4)
    `./storybook-stories.js`,
    // vite builder
    `/virtual:/@storybook/builder-vite/vite-app.js`,
  ].map(normalize);

  const modulesByName = new Map<NormalizedName, Module>();
  const nodeModules = new Map<string, NormalizedName[]>();
  const namesById = new Map<Module['id'], NormalizedName>();
  const reasonsById = new Map<Module['id'], NormalizedName[]>();
  const csfGlobsByName = new Set<NormalizedName>();

  stats.modules
    .filter((mod) => isUserModule(mod))
    .forEach((mod) => {
      const normalizedName = normalize(mod.name);
      modulesByName.set(normalizedName, mod);
      namesById.set(mod.id, normalizedName);

      const packageName = getPackageName(mod.name);
      if (packageName) {
        // Track all modules from any node_modules directory by their package name, so we can mark
        // all those files "changed" if a dependency (version) changes, while still being able to
        // "untrace" certain files (or globs) in those packages.
        if (!nodeModules.has(packageName)) nodeModules.set(packageName, []);
        nodeModules.get(packageName).push(normalizedName);
      }

      if (mod.modules) {
        mod.modules.forEach((m) => modulesByName.set(normalize(m.name), mod));
      }

      const normalizedReasons = mod.reasons
        .map((reason) => normalize(reason.moduleName))
        .filter((reasonName) => reasonName && reasonName !== normalizedName);
      reasonsById.set(mod.id, normalizedReasons);

      if (reasonsById.get(mod.id).some((reason) => storiesEntryFiles.includes(reason))) {
        csfGlobsByName.add(normalizedName);
      }
    });

  if (csfGlobsByName.size === 0) {
    // Check for misconfigured Storybook configDir. Only applicable to v6 store because v7 store
    // does not use configDir in the entry file path so there's no fix to recommend there.
    const storiesEntryRegExp = /^(.+\/)?generated-stories-entry\.js$/;
    const foundEntry = stats.modules.find(
      (mod) => storiesEntryRegExp.test(mod.name) && !storiesEntryFiles.includes(normalize(mod.name))
    );
    const entryFile = foundEntry && normalize(foundEntry.name);
    ctx.log.error(noCSFGlobs({ statsPath, storybookDir, storybookBuildDir, entryFile, viewLayer }));
    throw new Error('Did not find any CSF globs in preview-stats.json');
  }

  const isCsfGlob = (name: NormalizedName) => csfGlobsByName.has(name);
  const isStorybookFile = (name: string) =>
    name && name.startsWith(`${storybookDir}/`) && !storiesEntryFiles.includes(name);
  const isStaticFile = (name: string) =>
    staticDirs.some((dir) => name && name.startsWith(`${dir}/`));

  ctx.untracedFiles = [];
  function untrace(filepath: string) {
    if (untraced.some((glob) => matchesFile(glob, filepath))) {
      ctx.untracedFiles.push(filepath);
      return false;
    }
    return true;
  }

  function files(moduleName: string) {
    const mod = modulesByName.get(moduleName);
    if (!mod) return [moduleName];
    // Normalize module names, if there are any
    return mod.modules?.length ? mod.modules.map((m) => normalize(m.name)) : [normalize(mod.name)];
  }

  const tracedFiles = [
    // Convert dependency names into their corresponding files which occur in the stats file.
    ...changedDependencies.flatMap((packageName) => nodeModules.get(packageName) || []),
    ...changedFiles,
  ].filter(untrace);
  const tracedPaths = new Set<string>();
  const affectedModuleIds = new Set<string | number>();
  const checkedIds = {};
  const toCheck = [];

  ctx.turboSnap = {
    rootPath,
    baseDir,
    storybookDir,
    staticDirs,
    globs: Array.from(csfGlobsByName),
    modules: Array.from(modulesByName.keys()),
    tracedFiles,
    tracedPaths,
    affectedModuleIds,
    bailReason: undefined,
  };

  const changedPackageLockFiles = tracedFiles.filter(isPackageLockFile);

  if (nodeModules.size === 0 && changedDependencies.length > 0) {
    // If we didn't find any node_modules in the stats file, it's probably incomplete and we can't
    // trace changed dependencies, so we bail just in case.
    ctx.turboSnap.bailReason = {
      changedPackageFiles: ctx.git.changedFiles
        .filter(isPackageManifestFile)
        .concat(changedPackageLockFiles),
    };
  }

  function shouldBail(moduleName: string) {
    if (isStorybookFile(moduleName)) {
      ctx.turboSnap.bailReason = { changedStorybookFiles: files(moduleName) };
      return true;
    }
    if (isStaticFile(moduleName)) {
      ctx.turboSnap.bailReason = { changedStaticFiles: files(moduleName) };
      return true;
    }
    return false;
  }

  function traceName(name: string, tracePath: string[] = []) {
    if (ctx.turboSnap.bailReason || isCsfGlob(name)) return;
    if (shouldBail(name)) return;
    const { id } = modulesByName.get(name) || {};
    const normalizedName = namesById.get(id);
    if (shouldBail(normalizedName)) return;

    if (!id || !reasonsById.get(id) || checkedIds[id]) return;
    // Queue this id for tracing
    toCheck.push([id, [...tracePath, id]]);

    if (reasonsById.get(id).some(isCsfGlob)) {
      affectedModuleIds.add(id);
      tracedPaths.add([...tracePath, id].map((pid) => namesById.get(pid)).join('\n'));
    }
  }

  if (ctx.options.traceChanged) {
    ctx.log.debug('Traced files...');
    ctx.log.debug(tracedFiles);
  }

  // First, check the files that have changed according to git
  tracedFiles.forEach((posixPath) => traceName(posixPath));
  // If more were found during that process, check them too.
  while (toCheck.length > 0) {
    const [id, tracePath] = toCheck.pop();
    checkedIds[id] = true;
    reasonsById
      .get(id)
      .filter(untrace)
      .forEach((reason) => traceName(reason, tracePath));
  }
  const affectedModules = Object.fromEntries(
    // The id will be compared against the result of the stories' `.parameters.filename` values (stories retrieved from getStoriesJsonData())
    Array.from(affectedModuleIds).map((id) => [String(id), files(namesById.get(id))])
  );

  if (ctx.options.traceChanged) {
    ctx.log.debug('Affected modules...');
    ctx.log.debug(affectedModules);
  }

  if (ctx.options.traceChanged) {
    ctx.log.info(
      tracedAffectedFiles(ctx, {
        changedFiles,
        affectedModules,
        modulesByName: Object.fromEntries(modulesByName),
        normalize,
      })
    );
    ctx.log.info('');
  }

  if (ctx.turboSnap.bailReason) {
    ctx.log.warn(bailFile({ turboSnap: ctx.turboSnap }));
    return null;
  }

  return affectedModules;
}
