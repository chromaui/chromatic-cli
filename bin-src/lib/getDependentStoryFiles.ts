import path from 'path';

import { matchesFile } from './utils';
import { getRepositoryRoot } from '../git/git';
import bailFile from '../ui/messages/warnings/bailFile';
import noCSFGlobs from '../ui/messages/errors/noCSFGlobs';
import tracedAffectedFiles from '../ui/messages/info/tracedAffectedFiles';
import { Context, Module, Reason, Stats } from '../types';

// Bail whenever one of these was changed
const GLOBALS = [
  /^package\.json$/,
  /^package-lock\.json$/,
  /^yarn\.lock$/,
  /\/package\.json$/,
  /\/package-lock\.json$/,
  /\/yarn\.lock$/,
];

// Ignore these while tracing dependencies
const EXTERNALS = [/^node_modules\//, /\/node_modules\//, /\/webpack\/runtime\//, /^\(webpack\)/];

const isPackageFile = (name: string) => GLOBALS.some((re) => re.test(name));
const isUserModule = (mod: Module | Reason) =>
  (mod as Module).id !== undefined &&
  (mod as Module).id !== null &&
  !EXTERNALS.some((re) => re.test((mod as Module).name || (mod as Reason).moduleName));

// Replaces Windows-style backslash path separators with POSIX-style forward slashes, because the
// Webpack stats use forward slashes in the `name` and `moduleName` fields. Note `changedFiles`
// already contains forward slashes, because that's what git yields even on Windows.
const posix = (localPath: string) => localPath.split(path.sep).filter(Boolean).join(path.posix.sep);

/**
 * Converts a module path found in the webpack stats to be relative to the (git) root path. Module
 * paths can be relative (`./module.js`) or absolute (`/path/to/project/module.js`). The webpack
 * stats may have been generated in a subdirectory, so we prepend the baseDir if necessary.
 * The result is a relative POSIX path compatible with `git diff --name-only`.
 */
export function normalizePath(posixPath: string, rootPath: string, baseDir = '') {
  if (!posixPath) return posixPath;
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
  changedFiles: string[]
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
  const normalize = (posixPath: string) => {
    // Do not try to normalize virtual paths
    if (posixPath.startsWith('/virtual:')) return posixPath;

    return normalizePath(posixPath, rootPath, baseDir); // e.g. `src/file.js` (no ./ prefix)
  };

  const storybookDir = normalize(posix(storybookConfigDir));
  const staticDirs = staticDir.map((dir: string) => normalize(posix(dir)));

  // NOTE: this only works with `main:stories` -- if stories are imported from files in `.storybook/preview.js`
  // we'll need a different approach to figure out CSF files (maybe the user should pass a glob?).
  const storiesEntryFiles = [
    // v6 store (SB <= 6.3)
    `${storybookDir}/generated-stories-entry.js`,
    // v6 store with root as config dir (or SB 6.4)
    `generated-stories-entry.js`,
    // v7 store (SB >= 6.4)
    `storybook-stories.js`,
    // vite builder
    `/virtual:/@storybook/builder-vite/vite-app.js`,
  ];

  const modulesByName: Record<string, Module> = {};
  const namesById: Record<number, string> = {};
  const reasonsById: Record<number, string[]> = {};
  const csfGlobsByName: Record<string, true> = {};

  stats.modules
    .filter((mod) => isUserModule(mod))
    .forEach((mod) => {
      const normalizedName = normalize(mod.name);
      modulesByName[normalizedName] = mod;
      namesById[mod.id] = normalizedName;

      if (mod.modules) {
        mod.modules.forEach((m) => {
          modulesByName[normalize(m.name)] = mod;
        });
      }

      reasonsById[mod.id] = mod.reasons
        .map((reason) => normalize(reason.moduleName))
        .filter((reasonName) => reasonName && reasonName !== normalizedName);

      if (reasonsById[mod.id].some((reason) => storiesEntryFiles.includes(reason))) {
        csfGlobsByName[normalizedName] = true;
      }
    });

  const globs = Object.keys(csfGlobsByName);
  const modules = Object.keys(modulesByName);

  if (globs.length === 0) {
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

  const isCsfGlob = (name: string) => !!csfGlobsByName[name];
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
    const mod = modulesByName[moduleName];
    if (!mod) return [moduleName];
    // Normalize module names, if there are any
    return mod.modules?.length ? mod.modules.map((m) => normalize(m.name)) : [normalize(mod.name)];
  }

  const tracedFiles = changedFiles.filter(untrace);
  const tracedPaths = new Set<string>();
  const affectedModuleIds = new Set<string | number>();
  const checkedIds = {};
  const toCheck = [];

  ctx.turboSnap = {
    rootPath,
    baseDir,
    storybookDir,
    staticDirs,
    globs,
    modules,
    tracedFiles,
    tracedPaths,
    affectedModuleIds,
    bailReason: undefined,
  };

  const changedPackageFiles = tracedFiles.filter(isPackageFile);
  if (changedPackageFiles.length) ctx.turboSnap.bailReason = { changedPackageFiles };

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

    const { id } = modulesByName[name] || {};
    const normalizedName = namesById[id];
    if (shouldBail(normalizedName)) return;

    if (!id || !reasonsById[id] || checkedIds[id]) return;
    // Queue this id for tracing
    toCheck.push([id, [...tracePath, id]]);

    if (reasonsById[id].some(isCsfGlob)) {
      affectedModuleIds.add(id);
      tracedPaths.add([...tracePath, id].map((pid) => namesById[pid]).join('\n'));
    }
  }

  // First, check the files that have changed according to git
  tracedFiles.forEach((posixPath) => traceName(posixPath));
  // If more were found during that process, check them too.
  while (toCheck.length > 0) {
    const [id, tracePath] = toCheck.pop();
    checkedIds[id] = true;
    reasonsById[id].filter(untrace).forEach((reason) => traceName(reason, tracePath));
  }
  const affectedModules = Object.fromEntries(
    // The id will be compared against the result of the stories' `.parameters.filename` values (stories retrieved from getStoriesJsonData())
    Array.from(affectedModuleIds).map((id) => [String(id), files(namesById[id])])
  );

  if (ctx.options.traceChanged) {
    ctx.log.info(
      tracedAffectedFiles(ctx, { changedFiles, affectedModules, modulesByName, normalize })
    );
    ctx.log.info('');
  }

  if (ctx.turboSnap.bailReason) {
    ctx.log.warn(bailFile({ turboSnap: ctx.turboSnap }));
    return null;
  }

  return affectedModules;
}
