import path from 'path';

import { getWorkingDir } from './utils';
import { getRepositoryRoot } from '../git/git';
import bailFile from '../ui/messages/warnings/bailFile';

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
  const storiesEntryFiles = [
    // Storybook 6.3-
    `${storybookDir}/generated-stories-entry.js`,
    // Storybook 6.4, v6 store
    `generated-stories-entry.js`,
    // Storybook 6.4, v7 store
    `storybook-stories.js`,
  ];

  const idsByName = {};
  const namesById = {};
  const reasonsById = {};
  const csfGlobsByName = {};

  stats.modules.filter(isUserModule).forEach((mod) => {
    const normalizedName = normalize(mod.name);
    idsByName[normalizedName] = mod.id;
    namesById[mod.id] = normalizedName;

    if (mod.modules) {
      mod.modules.forEach((m) => {
        idsByName[normalize(m.name)] = mod.id;
      });
    }

    reasonsById[mod.id] = mod.reasons
      .map((reason) => normalize(reason.moduleName))
      .filter((reasonName) => reasonName && reasonName !== normalizedName);

    if (reasonsById[mod.id].some((reason) => storiesEntryFiles.includes(reason))) {
      csfGlobsByName[normalizedName] = true;
    }
  });

  ctx.log.info(`Found ${Object.keys(csfGlobsByName).length} CSF globs`);
  ctx.log.info(`Found ${Object.keys(idsByName).length} user modules`);

  const isCsfGlob = (name) => !!csfGlobsByName[name];
  const isConfigFile = (name) =>
    name && name.startsWith(`${storybookDir}/`) && !storiesEntryFiles.includes(name);
  const isStaticFile = (name) => staticDirs.some((dir) => name && name.startsWith(`${dir}/`));

  const changedCsfIds = new Set();
  const checkedIds = {};
  const toCheck = [];

  let bail = changedFiles.find(isGlobal);

  function shouldBail(name) {
    if (isConfigFile(name) || isStaticFile(name)) {
      bail = name;
      return true;
    }
    return false;
  }

  function traceName(normalizedName) {
    if (bail || isCsfGlob(normalizedName)) return;
    if (shouldBail(normalizedName)) return;

    const id = idsByName[normalizedName];
    const idNormalizedName = namesById[id];
    if (shouldBail(idNormalizedName)) return;

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
