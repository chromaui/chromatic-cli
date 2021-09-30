import path from 'path';

import { getWorkingDir } from './utils';
import { getRepositoryRoot } from '../git/git';
import bailFile from '../ui/messages/warnings/bailFile';

// Bail whenever one of these was changed
const GLOBALS = [/\/node_modules\//, /\/package\.json$/, /\/package-lock\.json$/, /\/yarn\.lock$/];

// Ignore these while tracing dependencies
const EXTERNALS = [/\/node_modules\//, /\/webpack\/runtime\//, /^\(webpack\)/];

const isGlobal = (name) => GLOBALS.some((re) => re.test(name));
const isUserModule = ({ id, name, moduleName }) =>
  id !== undefined && id !== null && !EXTERNALS.some((re) => re.test(name || moduleName));

// Replaces Windows-style backslash path separators with POSIX-style forward slashes, because the
// Webpack stats use forward slashes in the `name` and `moduleName` fields. Note `changedFiles`
// already contains forward slashes, because that's what git yields even on Windows.
const posix = (localPath) => localPath.split(path.sep).filter(Boolean).join(path.posix.sep);

/**
 * Converts a module path found in the webpack stats to be relative to the (git) root path. Module
 * paths can be relative (`./module.js`) or absolute (`/path/to/project/module.js`). The webpack
 * stats may have been generated in a subdirectory, so we prepend the workingDir if necessary.
 * The result is a relative POSIX path compatible with `git diff --name-only`.
 */
export function normalizePath(posixPath, rootPath, workingDir = '') {
  if (!posixPath) return posixPath;
  return path.posix.isAbsolute(posixPath)
    ? path.posix.relative(rootPath, posixPath)
    : path.posix.join(workingDir, posixPath);
}

/**
 * This traverses the webpack module stats to retrieve a set of CSF files that somehow trace back to
 * the changed git files. The result is a map of Module ID => file path. In the end we'll only send
 * the Module IDs to Chromatic, the file paths are only for logging purposes.
 */
export async function getDependentStoryFiles(ctx, stats, changedFiles) {
  const { configDir = '.storybook', staticDir = [] } = ctx.storybook || {};

  // Currently we enforce Storybook to be built by the Chromatic CLI, to ensure absolute paths match
  // up between the webpack stats and the git repo root.
  const rootPath = await getRepositoryRoot(); // e.g. `/path/to/project` (always absolute posix)
  const workingDir = getWorkingDir(rootPath); // e.g. `packages/storybook` or empty string
  const normalize = (posixPath) => normalizePath(posixPath, rootPath, workingDir);

  const storybookDir = normalize(posix(configDir));
  const staticDirs = staticDir.map((dir) => normalize(posix(dir)));

  // NOTE: this only works with `main:stories` -- if stories are imported from files in `.storybook/preview.js`
  // we'll need a different approach to figure out CSF files (maybe the user should pass a glob?).
  const storiesEntryFile = `${storybookDir}/generated-stories-entry.js`;

  const idsByName = {};
  const reasonsById = {};
  const csfGlobsByName = {};

  stats.modules.filter(isUserModule).forEach((mod) => {
    const normalizedName = normalize(mod.name);
    idsByName[normalizedName] = mod.id;

    if (mod.modules) {
      mod.modules.forEach((m) => {
        idsByName[normalize(m.name)] = mod.id;
      });
    }

    reasonsById[mod.id] = mod.reasons
      .map((reason) => normalize(reason.moduleName))
      .filter((reasonName) => reasonName && reasonName !== normalizedName);

    if (reasonsById[mod.id].includes(storiesEntryFile)) {
      csfGlobsByName[normalizedName] = true;
    }
  });

  ctx.log.debug(`Found ${Object.keys(csfGlobsByName).length} CSF globs`);
  ctx.log.debug(`Found ${Object.keys(idsByName).length} user modules`);

  const isCsfGlob = (name) => !!csfGlobsByName[name];
  const isConfigFile = (name) => name.startsWith(`${storybookDir}/`) && name !== storiesEntryFile;
  const isStaticFile = (name) => staticDirs.some((dir) => name.startsWith(`${dir}/`));

  const changedCsfIds = new Set();
  const checkedIds = {};
  const toCheck = [];

  let bail = changedFiles.find(isGlobal);

  function traceName(normalizedName) {
    if (bail || isCsfGlob(normalizedName)) return;
    if (isConfigFile(normalizedName) || isStaticFile(normalizedName)) {
      bail = normalizedName;
      return;
    }

    const id = idsByName[normalizedName];
    if (!id || !reasonsById[id] || checkedIds[id]) return;
    toCheck.push(id);

    if (reasonsById[id].some(isCsfGlob)) {
      changedCsfIds.add(id);
    }
  }

  changedFiles.forEach(traceName);
  while (toCheck.length > 0) {
    const id = toCheck.pop();
    checkedIds[id] = true;
    reasonsById[id].forEach(traceName);
  }

  if (bail) {
    ctx.log.warn(bailFile(bail));
    return false;
  }

  return stats.modules.reduce((acc, mod) => {
    if (changedCsfIds.has(mod.id))
      acc[String(mod.id)] = normalize(mod.name).replace(/ \+ \d+ modules$/, '');
    return acc;
  }, {});
}
