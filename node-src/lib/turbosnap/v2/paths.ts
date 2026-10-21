import path from 'path';

import { AbsolutePath, Module } from '../../../types';
import { relativeTo } from '../../getStorybookProjectRoot';
import { matchesFile } from '../../utilities';
import { FilePath } from './graph';

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
export function moduleFileNames(module: Module): FilePath[] {
  const root = module.nameForCondition ?? module.name;
  const names = [
    root,
    ...(module.modules ?? []).map((inner) => inner.nameForCondition ?? inner.name),
  ];
  return [...new Set(names.filter(Boolean).map((name) => stripConcatenatedModuleSuffix(name)))];
}

/**
 * The two roots that anchor a stats module path. They always travel together through
 * canonicalization: {@link normalizeStatsPath} resolves a relative stats path from `statsRoot`, then
 * names it relative to `projectRoot`.
 */
export interface StatsRoots {
  /** The absolute Storybook project root that canonical manifest keys are relative to. */
  projectRoot: AbsolutePath;
  /** The absolute directory relative stats paths are named from. */
  statsRoot: AbsolutePath;
}

/**
 * The canonical paths of a stats module's source files: its {@link moduleFileNames}, each folded
 * onto the file it stands for (see {@link foldStatsId}) and normalized, root first. The single
 * place the "canonical file names" rule lives, so every walk over
 * `stats.modules` reads the same definition.
 *
 * @param module The stats module.
 * @param roots The roots to anchor against. See {@link StatsRoots}.
 *
 * @returns The canonical file paths, root first, with empty entries and duplicates dropped.
 */
export function canonicalFileNames(module: Module, roots: StatsRoots): FilePath[] {
  return moduleFileNames(module).map((name) =>
    normalizeStatsPath(foldStatsId(name), roots.projectRoot, roots.statsRoot)
  );
}

/**
 * The canonical paths that import a stats module: its `reasons` mapped to `moduleName`, entry reasons
 * (null `moduleName`) dropped, each folded onto the file it stands for (see {@link foldStatsId})
 * and normalized. The single place the "canonical importers" rule lives,
 * so `readStatsGraph` and story detection cannot drift apart.
 *
 * @param module The stats module.
 * @param roots The roots to anchor against. See {@link StatsRoots}.
 *
 * @returns The canonical importer paths.
 */
export function canonicalImporters(module: Module, roots: StatsRoots): FilePath[] {
  return (module.reasons ?? [])
    .map((reason) => reason.moduleName)
    .filter((name): name is FilePath => typeof name === 'string')
    .map((name) => normalizeStatsPath(foldStatsId(name), roots.projectRoot, roots.statsRoot));
}

/**
 * The canonical path of a stats module's root source file: the first of its {@link canonicalFileNames}.
 * Only the root identifies the module and matches it against importers; the other inner names of a
 * concatenation group are its descendants.
 *
 * @param module The stats module.
 * @param roots The roots to anchor against. See {@link StatsRoots}.
 *
 * @returns The canonical root path, or undefined when the module names no files.
 */
export function rootFilePath(module: Module, roots: StatsRoots): FilePath | undefined {
  return canonicalFileNames(module, roots)[0];
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

// A file inside pnpm's virtual store: `<prefix>node_modules/.pnpm/<store dir>/node_modules/<package>/<subpath>`.
// The store directory encodes the package's version and its resolved peers
// (`storybook@10.6.3_@types+react@19.2.2_react@19.2.0`), so a peer bump renames it with no byte changed.
// The prefix is greedy, so a store nested inside another package's store matches at the innermost `.pnpm`.
const PNPM_STORE_PATH =
  /^(?<prefix>(?:.*\/)?node_modules\/)\.pnpm\/(?<storeDir>[^/]+)\/node_modules\/(?<package>@[^/]+\/[^/]+|[^/]+)\/(?<subpath>.+)$/;

// A file inside a package reached through a plain `node_modules` directory, such as pnpm's top-level
// symlink to a store copy. Its package root is the spelling a normalized store path takes.
const NODE_MODULES_PACKAGE_PATH =
  /^(?<prefix>(?:.*\/)?node_modules\/)(?<package>@[^/]+\/[^/]+|[^/]+)\//;

/**
 * Builds the path each file contributes to a roll-up, so a pnpm peer-dependency rename does not move
 * every hash. A file in pnpm's virtual store rolls up as `<prefix>node_modules/<package>/<subpath>`,
 * without the store directory, but only when the build bundles exactly one copy of that package.
 *
 * The single-copy condition is what keeps this safe. When a peer split leaves two copies of a package
 * in the build (say, two `@emotion/react` instances that no longer share a theme context), the copies
 * can land in different roll-ups (preview and story), so normalizing each to the same path would hide
 * a real rendering change. Packages with more than one copy keep their real paths, so the split
 * itself moves the hashes. A real version bump is still caught: the bytes change.
 *
 * A bundler can also name a package through a plain `node_modules/<package>/` path, such as pnpm's
 * top-level symlink, and load it as a module instance separate from the store copy. That path is
 * already the spelling a normalized store path would take, so it counts as one more copy.
 *
 * Only roll-ups use this. Manifest keys (`files`, `storyFiles`, `skippedFiles`) keep real paths.
 * Layouts the pattern does not recognize roll up under their real paths: a custom `virtualStoreDir`,
 * pnpm's global virtual store, and Bun or Yarn PnP installs.
 *
 * @param filePaths Every canonical path in the build.
 *
 * @returns The roll-up path of a canonical path.
 */
export function buildPnpmRollUpPath(
  filePaths: Iterable<FilePath>
): (filePath: FilePath) => FilePath {
  const { copies, storeFiles } = countPackageCopies(filePaths);

  // Resolved once here rather than per lookup: every story's roll-up asks again for the same files.
  const rollUpPaths = new Map<FilePath, FilePath>();
  for (const [filePath, { prefix, package: packageName, subpath }] of storeFiles) {
    if (copies.get(prefix + packageName)?.size === 1) {
      rollUpPaths.set(filePath, `${prefix}${packageName}/${subpath}`);
    }
  }
  return (filePath) => rollUpPaths.get(filePath) ?? filePath;
}

/**
 * Counts the copies of each `<prefix>node_modules/<package>` root in the build, by store directory.
 * A plain `node_modules` path counts as a copy under the empty name, which no store directory has.
 *
 * @param filePaths Every canonical path in the build.
 *
 * @returns The store directories per package root, and the parts of every store path.
 */
function countPackageCopies(filePaths: Iterable<FilePath>) {
  const copies = new Map<string, Set<string>>();
  const storeFiles: [FilePath, Record<string, string>][] = [];
  for (const filePath of filePaths) {
    const store = PNPM_STORE_PATH.exec(filePath)?.groups;
    const match = store ?? NODE_MODULES_PACKAGE_PATH.exec(filePath)?.groups;
    if (!match) continue;
    const packageRoot = match.prefix + match.package;
    copies.set(packageRoot, (copies.get(packageRoot) ?? new Set()).add(store?.storeDir ?? ''));
    if (store) storeFiles.push([filePath, store]);
  }
  return { copies, storeFiles };
}

// A Rollup proxy id: a NUL byte before the id of a module a builder created to stand for a real
// file (CommonJS interop, framework SFC blocks). Only a proxy for a relative path names a file.
const NUL = '\0';
const FOLDABLE_NUL_PREFIXES = [`${NUL}./`, `${NUL}../`];

// Webpack names a require.context by its mode and the include glob, e.g. `./icons/ lazy ^\\.\\/.*\\.svg`.
// Webpack writes the mode after a space (`./src/ sync`, `./src/lib/ lazy`) and appends
// ` nonrecursive` before the glob only when recursion is off; webpack 4 omits the slash before the
// space (`./src sync`). The modes are sync, eager, weak, async-weak, lazy and lazy-once, and rspack
// delimits the same mode markers with pipes (`./src|lazy|`). A context name is a glob expression
// rather than a file path, so neither its `?` nor its `!` is folded.
const CONTEXT_MODES = ['sync', 'eager', 'weak', 'async-weak', 'lazy', 'lazy-once'];
// Story detection only reads lazy contexts, and only the plain lazy mode: lazy-once resolves its
// group once up front rather than per story.
const LAZY_MODES = CONTEXT_MODES.filter((mode) => mode === 'lazy');

// The leading space anchors the space form to webpack's spelling: without it a path segment that
// merely ends in a mode token (`./src/tweak panel.tsx`) reads as a context name and keeps its `?`.
const CONTEXT_PATTERN = ` (?:${CONTEXT_MODES.join('|')}) |\\|(?:${CONTEXT_MODES.join('|')})\\|`;
const LAZY_PATTERN = ` (?:${LAZY_MODES.join('|')}) |\\|(?:${LAZY_MODES.join('|')})\\|`;

// eslint-disable-next-line security/detect-non-literal-regexp -- the pattern only interpolates the hardcoded mode lists above
const CONTEXT_MARKER = new RegExp(CONTEXT_PATTERN);
// eslint-disable-next-line security/detect-non-literal-regexp -- the pattern only interpolates the hardcoded mode lists above
export const LAZY_CONTEXT_MARKER = new RegExp(LAZY_PATTERN);

/**
 * Whether a file path names a synthetic module whose contents do not exist as a file on disk.
 *
 * @param path The module name from the stats file.
 *
 * @returns Whether the path must not be resolved or read from disk.
 */
export function isSyntheticFile(path: FilePath): boolean {
  // Note: The file path of the data: "files" start with `data:image/svg+xml` or similar rather than
  // a directory path.
  if (path.includes('virtual:') || path.startsWith('data:')) {
    return true;
  }

  // A NUL proxy for a relative path folds onto that file (see {@link foldStatsId}); any other
  // leading NUL — a bare runtime helper like `\0commonjsHelpers.js` or an opaque rooted id like
  // `\0/@data-uri/...` — names nothing on disk. Asked on the raw id: stripping would remove the NUL.
  return path.startsWith(NUL) && !FOLDABLE_NUL_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * Strips a trailing ` + N modules` suffix from a concatenated module's name, leaving the root file.
 *
 * @param statsPath The module name from the stats file.
 *
 * @returns The name without the concatenation suffix.
 */
export function stripConcatenatedModuleSuffix(statsPath: FilePath): FilePath {
  return statsPath.replace(/ \+ \d+ modules?$/, '');
}

/**
 * Converts a stats module path into the canonical manifest key: a POSIX path relative to the
 * Storybook project root. Relative stats paths are first resolved from `statsRoot`, because a
 * builder may name them from the repository root even though manifest keys anchor at the project.
 * Stats ids are folded onto the file they stand for by the caller before they reach here (see
 * {@link foldStatsId}): this function also keys real on-disk paths, where a literal `?` or `!` can
 * be part of the filename. Synthetic modules (e.g. Vite's `virtual:` entries and inline `data:` URLs)
 * have no on-disk location and are returned unchanged.
 *
 * @param statsPath The module name from the stats file (relative like `./src/x` or absolute).
 * @param projectRoot The absolute Storybook project root to anchor against.
 * @param statsRoot The directory relative stats paths are named from. Defaults to the project root.
 *
 * @returns The canonical project-root-relative POSIX path.
 */
export function normalizeStatsPath(
  statsPath: FilePath,
  projectRoot: AbsolutePath,
  statsRoot: AbsolutePath = projectRoot
): FilePath {
  if (isSyntheticFile(statsPath)) {
    return statsPath;
  }

  return prefixInProjectPath(relativeTo(projectRoot, resolveStatsPath(statsPath, statsRoot)));
}

/**
 * Adds the `./` prefix that marks a path as living inside the project. A path that already escapes
 * the project keeps its leading `../`, which is prefix enough to read.
 *
 * @param relativePath The project-relative POSIX path.
 *
 * @returns The path with an explicit prefix.
 */
function prefixInProjectPath(relativePath: FilePath): FilePath {
  return relativePath.startsWith('../') ? relativePath : `./${relativePath}`;
}

/**
 * The file a stats id stands for. Rollup reads one real file under several ids: the plain path, a
 * NUL-prefixed proxy for CommonJS interop and framework blocks (`\0./x.js?commonjs-module`), and
 * the plain path with a builder query (`./src/Foo.vue?vue&type=script`). Folding every spelling
 * onto the one file is what keeps a module and its dependency edges in the manifest under a key
 * that names a real file. V1 applies the same NUL and query rule when it groups colliding modules
 * (see `getDependentStoryFiles`).
 *
 * A NUL followed by anything but `./` or `../` — an absolute or otherwise opaque id such as
 * `\0/@data-uri/data:text/javascript,...` — is synthetic and passes through unchanged: the
 * Storybook builder-vite plugin relativizes a NUL id only when the path it strips to is a module
 * in the graph, so a raw rooted id in the stats has no file behind it.
 *
 * Webpack and rspack name a module run through loaders by its loader chain followed by the
 * resource (`css-loader/dist/cjs.js??ruleSet[1].rules[4].use[1]!./src/styles.module.css`), and
 * an inline match resource adds a prefix before `!=!`. The resource after the last `!` is the file
 * that was loaded, so the id folds onto it. A require-context name is a glob expression whose
 * include regex can hold `!` and `?` (`(?!.*node_modules)`), so it passes through unchanged.
 *
 * Every stats id is folded exactly once, where it enters the graph (see {@link canonicalFileNames},
 * {@link canonicalImporters} and the on-disk locator in statsGraph). The shared normalizers never
 * fold: they also key real disk paths, where a `?` or `!` is part of the filename.
 *
 * @param statsPath The module name from the stats file.
 *
 * @returns The path of the file the id stands for, or the id unchanged when synthetic.
 */
export function foldStatsId(statsPath: FilePath): FilePath {
  // The whole id is checked first: a bare data URL can carry a `!` in its payload.
  if (isSyntheticFile(statsPath) || CONTEXT_MARKER.test(statsPath)) {
    return statsPath;
  }

  // The resource a loader chain loads is folded by the same rules as a bare id.
  const resource = stripLoaderChain(statsPath);
  if (isSyntheticFile(resource)) {
    return resource;
  }

  // A NUL proxy for a relative path stands for that path, without the NUL or the query.
  const unproxied = resource.startsWith(NUL) ? resource.slice(NUL.length) : resource;
  return stripQuery(unproxied);
}

/**
 * Strips a webpack loader chain from a stats id, leaving the resource it loads. The resource is
 * whatever follows the last `!`, which covers plain chains, the `!`, `!!` and `-!` prefixes and the
 * `matchResource!=!loaders!resource` form alike. Every `!` is read as a chain separator, so a file
 * whose own name contains `!` (`./src/!important.css`) folds onto the wrong path. webpack splits
 * import requests on `!` too, but a Vite id has no loader chain, so there the rule is a known
 * tradeoff rather than a match for the builder.
 *
 * @param statsPath The module name from the stats file.
 *
 * @returns The loaded resource, or the name unchanged when it has no chain.
 */
function stripLoaderChain(statsPath: FilePath): FilePath {
  return statsPath.slice(statsPath.lastIndexOf('!') + 1);
}

/**
 * Strips a builder's query from a stats id, leaving the file named. Vite suffixes the ids of the
 * module blocks and CommonJS interop files it extracts, and a webpack resource can carry one after
 * its loader chain (`./icon.svg?raw`); the query is the builder's, not the file's. The caller keeps
 * require-context names away from here, since their `?` belongs to a glob rather than a query.
 *
 * @param statsPath The module name from the stats file, without a loader chain.
 *
 * @returns The file name without the query.
 */
function stripQuery(statsPath: FilePath): FilePath {
  const queryStart = statsPath.indexOf('?');
  return queryStart === -1 ? statsPath : statsPath.slice(0, queryStart);
}

/**
 * Resolves a stats module path to an absolute on-disk path for hashing, anchoring relative paths at
 * the Storybook project root. Escape markers are removed first; see {@link stripNullBytes}. The id
 * is folded onto the file it stands for by the caller before it reaches here; see
 * {@link foldStatsId}.
 *
 * @param statsPath The module name from the stats file.
 * @param statsRoot The absolute directory relative stats paths are named from.
 *
 * @returns The absolute path to the file on disk.
 */
export function resolveStatsPath(statsPath: FilePath, statsRoot: AbsolutePath): AbsolutePath {
  const stripped = stripNullBytes(stripConcatenatedModuleSuffix(statsPath));
  return path.isAbsolute(stripped) ? stripped : path.resolve(statsRoot, stripped);
}

/**
 * Removes the NUL bytes webpack uses to escape a path (`#` is `\0#`), leaving the name the file has
 * on disk.
 *
 * @param statsPath The module name from the stats file.
 *
 * @returns The name with the escape markers removed.
 */
function stripNullBytes(statsPath: FilePath): FilePath {
  return statsPath.replaceAll('\0', '');
}

/**
 * Builds the check for whether a file matches one of the user's globs, as `--externals` and
 * `--untraced` name them. A glob is matched against the git-root-relative posix path with the same
 * matcher v1 uses on its changed files, so a glob means the same thing to both generations. An empty
 * glob names nothing, so it is ignored here rather than by every caller: picomatch rejects an empty
 * pattern, and one can arrive from an empty flag value or a configuration file entry.
 *
 * @param gitRoot The absolute repository root the globs are relative to.
 * @param globs The user's globs.
 *
 * @returns The check, by absolute path.
 */
export function gitRootGlobMatcher(
  gitRoot: AbsolutePath,
  globs: string[]
): (absolutePath: AbsolutePath) => boolean {
  const patterns = globs.filter(Boolean);
  return (absolutePath) => {
    const gitRelativePath = relativeTo(gitRoot, absolutePath);
    return patterns.some((glob) => matchesFile(glob, gitRelativePath));
  };
}
