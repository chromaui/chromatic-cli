import path from 'path';

import {
  AbsolutePath,
  Context,
  Module,
  Reason,
  Stats,
  TurboSnap,
  UntracedFile,
} from '../../../types';
import noCSFGlobs from '../../../ui/messages/errors/noCSFGlobs';
import tracedAffectedFiles from '../../../ui/messages/info/tracedAffectedFiles';
import bailFile from '../../../ui/messages/warnings/bailFile';
import { relativeTo } from '../../getStorybookProjectRoot';
import { posix } from '../../posix';
import {
  isDocumentationFile,
  isPackageLockFile,
  isPackageManifestFile,
  matchesFile,
} from '../../utilities';
import { stripFoldableNul } from '../nulIds';
import { TraceChangedFilesResult } from '../types';

type FilePath = string;
type NormalizedName = string;
type TraceToCheck = (string | number | string[])[];

// Ignore these while tracing dependencies
const INTERNALS = [/\/webpack\/runtime\//, /^\(webpack\)/];

const isUserModule = (module_: Module | Reason) =>
  (module_ as Module).id !== undefined &&
  (module_ as Module).id !== null &&
  !INTERNALS.some((re) =>
    re.test((module_ as Module).name || (module_ as Reason).moduleName || '')
  );

// For any path in node_modules, return the package name, including scope prefix if any.
const getPackageName = (modulePath: string) => {
  const [, scopedName] = modulePath.match(/\/node_modules\/(@[\w-]+\/[\w-]+)\//) || [];
  if (scopedName) return scopedName;
  const [, unscopedName] = modulePath.match(/\/node_modules\/([\w-]+)\//) || [];
  return unscopedName;
};

// True for a "plain" path id: no NUL virtual prefix, no `?query`, and no `+ N modules` suffix.
const isPlainId = (name: string) =>
  name.codePointAt(0) !== 0 && !name.includes('?') && !name.includes(' + ');

// Rank: plain `./` id (3) > plain bare id (2) > `./` facet (1) > anything else (0).
const rank = (memberName: string) =>
  (isPlainId(memberName) ? 2 : 0) + (memberName.startsWith('./') ? 1 : 0);

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
 * The result of tracing story files: either `bailed` or `traced`. This never skips since it's
 * handled by the caller.
 */
export type DependentStoryFilesResult = Exclude<TraceChangedFilesResult, { status: 'skipped' }>;

/**
 * Traverses the webpack module stats to retrieve a set of CSF files that somehow trace back to
 * the changed git files. The result is a map of Module ID => file path. In the end we'll only
 * send the Module IDs to Chromatic, the file paths are only for logging purposes.
 *
 * @param ctx The context set when executing the CLI.
 * @param stats The stats file information from the project's builder (Webpack, for example).
 * @param statsPath The path to the stats file generated from the project's builder (Webpack, for
 * example).
 * @param changedFiles A list of changed files.
 * @param changedDependencies A list of changed dependencies.
 *
 * @returns `bailed` when TurboSnap gave up, or `traced` with the affected story files in
 * `onlyStoryFiles`.
 */
// TODO: refactor this function
// eslint-disable-next-line complexity, max-statements
export async function getDependentStoryFiles(
  ctx: Context,
  stats: Stats,
  statsPath: string,
  changedFiles: string[],
  changedDependencies: string[] = []
): Promise<DependentStoryFilesResult> {
  const { rootPath } = ctx.git || {};
  if (!rootPath) {
    throw new Error('Failed to determine repository root');
  }

  const { projectRoot = process.cwd() } = ctx.storybook || {};
  const configDirectory = ctx.storybook?.configDir ?? path.resolve(projectRoot, '.storybook');
  const staticDirectoriesAbsolute = ctx.storybook?.staticDirs ?? [];
  const baseDirectory = relativeTo(rootPath, projectRoot);
  const { storybookBuildDir, untraced = [] } = ctx.options;

  // Convert a "webpack path" (relative to storybookBaseDir) to a "git path" (relative to repository root)
  // e.g. `./src/file.js` => `path/to/storybook/src/file.js`
  const normalize = (posixPath: FilePath): NormalizedName => {
    const CSF_REGEX = /\s+(sync|lazy)\s+/g;
    const URL_PARAM_REGEX = /(\?.*)/g;
    // Strip the NUL from proxies of a relative path first, so CommonJS proxy ids like
    // `\0./node_modules/react/index.js?commonjs-es-import` normalize to the file they proxy.
    // Opaque NUL ids (`\0commonjsHelpers.js`, `\0vite/preload-helper.js`) name no file, so they
    // keep the NUL and can never match a changed file.
    const name = stripFoldableNul(posixPath);
    const newPath = normalizePath(name, rootPath, projectRoot);
    // Trim query params such as `?ngResource` which are sometimes present
    return URL_PARAM_REGEX.test(newPath) && !CSF_REGEX.test(newPath)
      ? newPath.replaceAll(URL_PARAM_REGEX, '')
      : newPath;
  };

  const storybookDirectory = relativeTo(rootPath, configDirectory);
  const staticDirectories = staticDirectoriesAbsolute.map((directory) =>
    relativeTo(rootPath, directory)
  );

  ctx.log.debug('BASE Directory:', baseDirectory);
  ctx.log.debug('Storybook CONFIG Directory:', storybookDirectory);

  // NOTE: this only works with `main:stories` -- if stories are imported from files in `.storybook/preview.js`
  // we'll need a different approach to figure out CSF files (maybe the user should pass a glob?).
  const storiesEntryFiles = [
    // v6 store (SB <= 6.3)
    path.join(configDirectory, 'generated-stories-entry.js'),
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
    `./storybook-config-entry.js`,
  ].map((file) => normalize(file));

  // Builder-generated modules that import the preview annotations (`previewAnnotations` entries,
  // addon and framework `preview.js` files) for every story. Their direct importers apply to every
  // story, so a change that reaches one bails like a change to `.storybook/preview.*`. They must
  // not become CSF globs, or those importers would be reported as story files matching no story.
  // V2 treats the same modules as global roots (see `VITE_COMPOSITION_ROOTS` in `v2/statsGraph.ts`).
  const globalRootFiles = [
    `/virtual:/@storybook/builder-vite/project-annotations.js`,
    `virtual:@storybook/builder-vite/project-annotations.js`,
  ].map((file) => normalize(file));
  const isGlobalRoot = (name: NormalizedName) =>
    globalRootFiles.some((prefix) => name.startsWith(prefix));

  const modulesByName = new Map<NormalizedName, Module>();
  const nodeModules = new Map<string, NormalizedName[]>();
  const namesById = new Map<Module['id'], NormalizedName>();
  const reasonsById = new Map<Module['id'], NormalizedName[]>();
  const csfGlobsByName = new Set<NormalizedName>();
  const annotationFilesByName = new Set<NormalizedName>();

  const isStorybookFile = (name: string) =>
    name &&
    name.startsWith(`${storybookDirectory}/`) &&
    !storiesEntryFiles.includes(name) &&
    !isDocumentationFile(name);

  // Distinct modules can normalize to one name: Vue/Svelte compile a component into several
  // modules (the component plus its `<style>` facets), CommonJS interop rewrites imports into
  // NUL-proxied ids, and rsbuild emits bare-path stubs next to `./`-prefixed ids. Tracing must
  // treat them as one module, or the importers of the overwritten ones become unreachable and
  // changed components or styles trace to no stories.
  const membersByName = new Map<NormalizedName, Module[]>();
  for (const module_ of stats.modules) {
    if (!isUserModule(module_)) continue;
    const name = normalize(module_.name);
    const members = membersByName.get(name);
    if (members) members.push(module_);
    else membersByName.set(name, [module_]);
  }

  // Track all modules from any node_modules directory by their package name, so we can mark
  // all those files "changed" if a dependency (version) changes, while still being able to
  // "untrace" certain files (or globs) in those packages.
  const trackNodeModules = (memberName: string, name: NormalizedName) => {
    const packageName = getPackageName(memberName);
    if (!packageName) return;
    const names = nodeModules.get(packageName);
    if (names) {
      if (!names.includes(name)) names.push(name);
    } else {
      nodeModules.set(packageName, [name]);
    }
  };

  for (const [name, members] of membersByName) {
    // Represent each group by its "plainest" member: a plain path id beats a facet id (one with
    // a NUL prefix or `?query`), and a `./`-prefixed id beats a bare one (the backend matches
    // `onlyStoryFiles` keys against stories' `parameters.filename` values with picomatch, where
    // a pattern without `./` does not match a filename that has it). Ties resolve to the last
    // member, preserving the previous last-write-wins behavior.
    let representative = members[0];
    for (const member of members) {
      if (rank(member.name) >= rank(representative.name)) representative = member;
    }

    // Grouping amplifies duplicate reasons (an SFC and its style facet often share importers),
    // and duplicates cost extra `untrace` calls and repeat entries in `--trace-changed` output.
    const reasons = [
      ...new Set(
        members
          .flatMap((member) =>
            (member.reasons || [])
              .map((reason) => reason.moduleName)
              .filter((moduleName): moduleName is FilePath => typeof moduleName === 'string')
              .map((moduleName) => normalize(moduleName))
          )
          .filter((reasonName) => reasonName && reasonName !== name)
      ),
    ];

    for (const member of members) {
      namesById.set(member.id, name);
      reasonsById.set(member.id, reasons);

      // Concatenated modules ("a.js + 1 modules") register their inner module names so they can
      // be traced too.
      for (const m of member.modules || []) {
        modulesByName.set(normalize(m.name), representative);
      }

      trackNodeModules(member.name, name);
    }

    modulesByName.set(name, representative);

    if (reasons.some((reason) => isGlobalRoot(reason))) {
      annotationFilesByName.add(name);
    }

    if (
      !isStorybookFile(name) &&
      !isGlobalRoot(name) &&
      reasons.some((reason) => storiesEntryFiles.some((prefix) => reason.startsWith(prefix))) // match module names that include a "+ N modules"
    ) {
      csfGlobsByName.add(name);
    }
  }

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
      })
    );
    throw new Error('Did not find any CSF globs in preview-stats.json');
  }

  const isCsfGlob = (name: NormalizedName) => csfGlobsByName.has(name);
  const isStaticFile = (name: string) =>
    staticDirectories.some((directory) => name && name.startsWith(`${directory}/`));

  const untracedFiles: UntracedFile[] = [];

  function untrace(filepath: string) {
    filepath = filepath.replace(/\s\+\s\d+\smodules?$/, ''); // strip ' + N modules' from the string before matching against `untraced`
    const matchedGlob = untraced.find((glob) => matchesFile(glob, filepath));
    if (matchedGlob) {
      untracedFiles.push({ filepath, glob: matchedGlob });
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

  const turboSnap: TurboSnap = {
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
    turboSnap.bailReason = {
      changedPackageFiles: [
        ...(ctx.git.changedFiles?.filter((file) => isPackageManifestFile(file)) || []),
        ...changedPackageLockFiles,
      ],
      bailSubreason: 'nodeModulesMissingInStats',
    };
  }

  // Build the chain of files leading from the originally changed file (as it appears in
  // `git diff`) to the Storybook config or static file that triggered the bail. The trace
  // path holds the module IDs visited on the way here.
  function buildBailPath(moduleName: string, tracePath: string[]): string[] {
    const tracedNames = tracePath.flatMap((moduleId) => namesById.get(moduleId) ?? []);
    return [...tracedNames, moduleName];
  }

  function shouldBail(moduleName: string, tracePath: string[] = []) {
    // Check staticDirs before the Storybook config dir so static assets
    // nested under `.storybook/` (e.g. an MSW-generated mockServiceWorker.js
    // inside a configured staticDir) aren't mis-categorized as config changes.
    if (isStaticFile(moduleName)) {
      turboSnap.bailReason = { changedStaticFiles: files(moduleName) };
      turboSnap.bailPath = buildBailPath(moduleName, tracePath);
      return true;
    }

    if (isStorybookFile(moduleName) || annotationFilesByName.has(moduleName)) {
      turboSnap.bailReason = { changedStorybookFiles: files(moduleName) };
      turboSnap.bailPath = buildBailPath(moduleName, tracePath);
      return true;
    }
    return false;
  }

  // TODO: refactor this function
  // eslint-disable-next-line complexity
  function traceName(name: string, tracePath: string[] = []) {
    if (turboSnap.bailReason || isCsfGlob(name)) return;
    if (shouldBail(name, tracePath)) return;
    const { id } = modulesByName.get(name) || {};
    // eslint-disable-next-line unicorn/no-null
    const normalizedName = namesById.get(id || null);
    if (!normalizedName) return;
    if (shouldBail(normalizedName, tracePath)) return;

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
      tracedAffectedFiles(
        { ...ctx, turboSnap, untracedFiles },
        {
          changedFiles,
          affectedModules,
          modulesByName: Object.fromEntries(modulesByName),
          normalize,
        }
      )
    );
    ctx.log.info('');
  }

  if (turboSnap.bailReason) {
    ctx.log.warn(bailFile({ turboSnap }));
    return { status: 'bailed', turboSnap };
  }

  return { status: 'traced', onlyStoryFiles: affectedModules, turboSnap, untracedFiles };
}
