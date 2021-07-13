import path from 'path';

import { getWorkingDir } from './utils';
import { getRepositoryRoot } from '../git/git';
import bailFile from '../ui/messages/warnings/bailFile';

// Bail whenever one of these was changed
const GLOBALS = [/\/node_modules\//, /\/package\.json$/, /\/package-lock\.json$/, /\/yarn\.lock$/];

// Ignore these while tracing dependencies
const EXTERNALS = [/\/node_modules\//, /\/webpack\/runtime\//, /^\(webpack\)/];

const isGlobal = (name) => GLOBALS.some((re) => re.test(name));
const isUserCode = ({ name, moduleName }) => !EXTERNALS.some((re) => re.test(name || moduleName));

// Replaces Windows-style backslash path separators with POSIX-style forward slashes, because the
// Webpack stats use forward slashes in the `name` and `moduleName` fields. Note `changedFiles`
// already contains forward slashes, because that's what git yields even on Windows.
const posix = (localPath) => localPath.split(path.sep).filter(Boolean).join(path.posix.sep);
const clean = (posixPath) => (posixPath.startsWith('./') ? posixPath.slice(2) : posixPath);

export async function getDependentStoryFiles(ctx, stats, changedFiles) {
  const { configDir = '.storybook', staticDir = [] } = ctx.storybook || {};

  const rootPath = await getRepositoryRoot(); // e.g. `/path/to/project` (always absolute posix)
  const workingDir = posix(getWorkingDir(rootPath)); // e.g. `services/webapp` or empty string
  const workingDirRegExp = workingDir && new RegExp(`^./${workingDir}`);

  // Module paths can be relative (`./module.js`) or absolute (`/path/to/project/services/webapp/module.js`)
  // By stripping either prefix, we have a consistent format to compare against (i.e. `module.js`).
  const basePath = path.posix.join(rootPath, workingDir);
  const baseRegExp = new RegExp(`^./|${basePath}/`);
  const base = (posixPath) => posixPath && posixPath.replace(baseRegExp, '');

  const storybookDir = base(posix(configDir));
  const staticDirs = staticDir.map((dir) => base(posix(dir)));

  // NOTE: this only works with `main:stories` -- if stories are imported from files in `.storybook/preview.js`
  // we'll need a different approach to figure out CSF files (maybe the user should pass a glob?).
  const storiesEntryFile = `${storybookDir}/generated-stories-entry.js`;

  const idsByName = {};
  const reasonsById = {};
  const csfGlobsByName = {};

  stats.modules.filter(isUserCode).forEach((mod) => {
    const baseModuleName = base(mod.name);

    if (mod.id) {
      idsByName[baseModuleName] = mod.id;
      (mod.modules ? mod.modules.map((m) => base(m.name)) : []).forEach((baseName) => {
        idsByName[baseName] = mod.id;
      });
    }

    reasonsById[mod.id] = mod.reasons
      .map((reason) => base(reason.moduleName))
      .filter((reasonName) => reasonName && reasonName !== baseModuleName);

    if (reasonsById[mod.id].includes(storiesEntryFile)) {
      csfGlobsByName[baseModuleName] = true;
    }
  });

  ctx.log.debug(`Found ${Object.keys(csfGlobsByName).length} CSF globs`);
  ctx.log.debug(`Found ${Object.keys(idsByName).length} user modules`);

  const isCsfGlob = (name) => !!csfGlobsByName[name];
  const isConfigFile = (name) => name.startsWith(storybookDir) && name !== storiesEntryFile;
  const isStaticFile = (name) => staticDirs.some((dir) => name.startsWith(dir));

  const changedCsfIds = new Set();
  const checkedIds = {};
  const toCheck = [];

  let bail = changedFiles.find(isGlobal);

  function traceName(name) {
    if (bail || isCsfGlob(name)) return;
    if (isConfigFile(name) || isStaticFile(name)) {
      bail = name;
      return;
    }

    const id = idsByName[name];
    if (!id || !reasonsById[id] || checkedIds[id]) return;
    toCheck.push(id);

    if (reasonsById[id].some(isCsfGlob)) {
      changedCsfIds.add(id);
    }
  }

  changedFiles.forEach((gitFilePath) => {
    const webpackFilePath = workingDir ? gitFilePath.replace(workingDirRegExp, '.') : gitFilePath;
    traceName(clean(webpackFilePath));
  });
  while (toCheck.length > 0) {
    const id = toCheck.pop();
    checkedIds[id] = true;
    reasonsById[id].forEach(traceName);
  }

  if (bail) {
    ctx.log.warn(bailFile(bail));
    return false;
  }

  return Object.fromEntries(
    stats.modules
      .filter((mod) => changedCsfIds.has(mod.id))
      .map((mod) => [String(mod.id), `./${base(mod.name).replace(/ \+ \d+ modules$/, '')}`])
  );
}
