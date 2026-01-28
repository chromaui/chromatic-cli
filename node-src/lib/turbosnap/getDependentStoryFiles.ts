import path from 'path';

import { Context, Module, Reason, Stats } from '../../types';
import noCSFGlobs from '../../ui/messages/errors/noCSFGlobs';
import tracedAffectedFiles from '../../ui/messages/info/tracedAffectedFiles';
import bailFile from '../../ui/messages/warnings/bailFile';
import { posix } from '../posix';
import { isPackageManifestFile, matchesFile } from '../utils';
import { SUPPORTED_LOCK_FILES } from './findChangedDependencies';

type FilePath = string;
type NormalizedName = string;
type TraceToCheck = (string | number | string[])[];

// Ignore these while tracing dependencies
const INTERNALS = [/\/webpack\/runtime\//, /^\(webpack\)/];

const isPackageLockFile = (name: string) =>
  SUPPORTED_LOCK_FILES.some((lockfile) => name.endsWith(lockfile));
const isUserModule = (module_: Module | Reason) =>
  (module_ as Module).id !== undefined &&
  (module_ as Module).id !== null &&
  !INTERNALS.some((re) => re.test((module_ as Module).name || (module_ as Reason).moduleName));

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
 * stats may have been generated in a subdirectory, so we prepend the baseDir if necessary. The
 * result is a relative POSIX path compatible with `git diff --name-only`. Virtual paths (e.g. Vite)
 * are returned as-is.
 *
 * @param posixPath The POSIX path to the file.
 * @param rootPath The project root path.
 * @param baseDirectory The base directory to the file.
 *
 * @returns A normalized path to the file.
 */
export function normalizePath(posixPath: string, rootPath: string, baseDirectory = '') {
  if (!posixPath || posixPath.startsWith('/virtual:')) return posixPath;

  return path.posix.isAbsolute(posixPath)
    ? path.posix.relative(rootPath, posixPath)
    : path.posix.join(baseDirectory, posixPath);
}

/**
 * This traverses the webpack module stats to retrieve a set of CSF files that somehow trace back to
 * the changed git files. The result is a map of Module ID => file path. In the end we'll only send
 * the Module IDs to Chromatic, the file paths are only for logging purposes.
 *
 * @param ctx The context set when executing the CLI.
 * @param stats The stats file information from the project's builder (Webpack, for example).
 * @param statsPath The path to the stats file generated from the project's builder (Webpack, for
 * example).
 * @param changedFiles A list of changed files.
 * @param changedDependencies A list of changed dependencies.
 *
 * @returns Any story files that are impacted by the list of changed files and dependencies.
 */
// TODO: refactor this function
// eslint-disable-next-line complexity, max-statements
export async function getDependentStoryFiles(
  ctx: Context,
  stats: Stats,
  statsPath: string,
  changedFiles: string[],
  changedDependencies: string[] = []
) {
  const { rootPath } = ctx.git || {};
  if (!rootPath) {
    throw new Error('Failed to determine repository root');
  }

  const {
    baseDir: baseDirectory = '',
    configDir: configDirectory = '.storybook',
    staticDir: staticDirectory = [],
    viewLayer,
  } = ctx.storybook || {};
  const {
    storybookBuildDir,
    // eslint-disable-next-line unicorn/prevent-abbreviations
    storybookConfigDir = configDirectory,
    untraced = [],
  } = ctx.options;

  // Convert a "webpack path" (relative to storybookBaseDir) to a "git path" (relative to repository root)
  // e.g. `./src/file.js` => `path/to/storybook/src/file.js`
  const normalize = (posixPath: FilePath): NormalizedName => {
    const CSF_REGEX = /\s+(sync|lazy)\s+/g;
    const URL_PARAM_REGEX = /(\?.*)/g;
    const newPath = normalizePath(posixPath, rootPath, baseDirectory);
    // Trim query params such as `?ngResource` which are sometimes present
    return URL_PARAM_REGEX.test(newPath) && !CSF_REGEX.test(newPath)
      ? newPath.replaceAll(URL_PARAM_REGEX, '')
      : newPath;
  };

  const storybookDirectory = normalize(posix(storybookConfigDir));
  const staticDirectories = staticDirectory.map((directory: string) => normalize(posix(directory)));

  ctx.log.debug('BASE Directory:', baseDirectory);
  ctx.log.debug('Storybook CONFIG Directory:', storybookDirectory);

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
    `virtual:@storybook/builder-vite/vite-app.js`,
    // rspack builder
    `./node_modules/.cache/storybook/default/dev-server/storybook-stories.js`,
    './node_modules/.cache/storybook-rsbuild-builder/storybook-stories.js',
    `./node_modules/.cache/storybook/storybook-rsbuild-builder/storybook-config-entry.js`,
    `./node_modules/.cache/storybook-rsbuild-builder/storybook-config-entry.js`,
  ].map((file) => normalize(file));

  const modulesByName = new Map<NormalizedName, Module>();
  const nodeModules = new Map<string, NormalizedName[]>();
  const namesById = new Map<Module['id'], NormalizedName>();
  const reasonsById = new Map<Module['id'], NormalizedName[]>();
  const csfGlobsByName = new Set<NormalizedName>();

  const isStorybookFile = (name: string) =>
    name && name.startsWith(`${storybookDirectory}/`) && !storiesEntryFiles.includes(name);

  stats.modules
    .filter((module_) => isUserModule(module_))
    // TODO: refactor this function
    // eslint-disable-next-line complexity
    .map((module_) => {
      const normalizedName = normalize(module_.name);
      modulesByName.set(normalizedName, module_);
      namesById.set(module_.id, normalizedName);

      const packageName = getPackageName(module_.name);
      if (packageName) {
        // Track all modules from any node_modules directory by their package name, so we can mark
        // all those files "changed" if a dependency (version) changes, while still being able to
        // "untrace" certain files (or globs) in those packages.
        if (!nodeModules.has(packageName)) nodeModules.set(packageName, []);
        nodeModules.get(packageName)?.push(normalizedName);
      }

      if (module_.modules) {
        for (const m of module_.modules) {
          modulesByName.set(normalize(m.name), module_);
        }
      }

      const normalizedReasons = module_.reasons
        ?.map((reason) => normalize(reason.moduleName))
        .filter((reasonName) => reasonName && reasonName !== normalizedName);
      if (normalizedReasons) {
        reasonsById.set(module_.id, normalizedReasons);
      }

      if (
        !isStorybookFile(normalizedName) &&
        reasonsById
          .get(module_.id)
          ?.some((reason) => storiesEntryFiles.some((prefix) => reason.startsWith(prefix))) // match module names that include a "+ N modules"
      ) {
        csfGlobsByName.add(normalizedName);
      }
    });

  if (csfGlobsByName.size === 0) {
    // Check for misconfigured Storybook configDir. Only applicable to v6 store because v7 store
    // does not use configDir in the entry file path so there's no fix to recommend there.
    const storiesEntryRegExp = /^(.+\/)?generated-stories-entry\.js$/;
    const foundEntry = stats.modules.find(
      (module_) =>
        storiesEntryRegExp.test(module_.name) &&
        !storiesEntryFiles.includes(normalize(module_.name))
    );
    const entryFile = foundEntry && normalize(foundEntry.name);
    ctx.log.error(
      noCSFGlobs({
        statsPath,
        storybookDir: storybookDirectory,
        storybookBuildDir,
        entryFile,
        viewLayer,
      })
    );
    throw new Error('Did not find any CSF globs in preview-stats.json');
  }

  const isCsfGlob = (name: NormalizedName) => csfGlobsByName.has(name);
  const isStaticFile = (name: string) =>
    staticDirectories.some((directory) => name && name.startsWith(`${directory}/`));

  ctx.untracedFiles = [];
  function untrace(filepath: string) {
    if (untraced.some((glob) => matchesFile(glob, filepath))) {
      ctx.untracedFiles?.push(filepath);
      return false;
    }
    return true;
  }

  function files(moduleName: string) {
    const module_ = modulesByName.get(moduleName);
    if (!module_) return [moduleName];
    // Normalize module names, if there are any
    return module_.modules?.length
      ? module_.modules.map((m) => normalize(m.name))
      : [normalize(module_.name)];
  }

  const tracedFiles = [
    // Convert dependency names into their corresponding files which occur in the stats file.
    ...changedDependencies.flatMap((packageName) => nodeModules.get(packageName) || []),
    ...changedFiles,
  ].filter((file) => untrace(file));
  const tracedPaths = new Set<string>();
  const affectedModuleIds = new Set<string | number>();
  const checkedIds = {};
  const toCheck: TraceToCheck[] = [];

  ctx.turboSnap = {
    rootPath,
    baseDir: baseDirectory,
    storybookDir: storybookDirectory,
    staticDirs: staticDirectories,
    globs: [...csfGlobsByName],
    modules: [...modulesByName.keys()],
    tracedFiles,
    tracedPaths,
    affectedModuleIds,
    bailReason: undefined,
  };

  const changedPackageLockFiles = tracedFiles.filter((file) => isPackageLockFile(file));

  if (nodeModules.size === 0 && changedDependencies.length > 0) {
    // If we didn't find any node_modules in the stats file, it's probably incomplete and we can't
    // trace changed dependencies, so we bail just in case.
    ctx.turboSnap.bailReason = {
      changedPackageFiles: [
        ...(ctx.git.changedFiles?.filter((file) => isPackageManifestFile(file)) || []),
        ...changedPackageLockFiles,
      ],
    };
  }

  function shouldBail(moduleName: string) {
    if (!ctx.turboSnap) ctx.turboSnap = {};

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

  // TODO: refactor this function
  // eslint-disable-next-line complexity
  function traceName(name: string, tracePath: string[] = []) {
    if (ctx.turboSnap?.bailReason || isCsfGlob(name)) return;
    if (shouldBail(name)) return;
    const { id } = modulesByName.get(name) || {};

    const normalizedName = namesById.get(id || null);
    if (!normalizedName) return;
    if (shouldBail(normalizedName)) return;

    if (!id || !reasonsById.get(id) || checkedIds[id]) return;
    // Queue this id for tracing
    toCheck.push([id, [...tracePath, id.toString()]]);

    if (reasonsById.get(id)?.some((reason) => isCsfGlob(reason))) {
      affectedModuleIds.add(id);
      tracedPaths.add([...tracePath, id].map((pid) => namesById.get(pid)).join('\n'));
    }
  }

  if (ctx.options.traceChanged) {
    ctx.log.debug('Traced files...');
    ctx.log.debug(tracedFiles);
  }

  // First, check the files that have changed according to git
  tracedFiles.map((posixPath) => traceName(posixPath));
  // If more were found during that process, check them too.
  while (toCheck.length > 0) {
    const [id, tracePath] = toCheck.pop() as TraceToCheck;

    if (Array.isArray(id)) {
      ctx.log.debug('Trace ID is an unexpected value, skipping');
      continue;
    }
    if (!Array.isArray(tracePath)) {
      ctx.log.debug('Trace path is an unexpected value, skipping');
      continue;
    }

    checkedIds[id] = true;
    reasonsById
      .get(id)
      ?.filter((file) => untrace(file))
      .map((reason) => traceName(reason, tracePath));
  }
  const affectedModules = Object.fromEntries(
    // The id will be compared against the result of the stories' `.parameters.filename` values (stories retrieved from getStoriesJsonData())
    [...affectedModuleIds].map((id) => [String(id), files(namesById.get(id) || '')])
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
    return;
  }

  return affectedModules;
}
