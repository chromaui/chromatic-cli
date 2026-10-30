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

// Directories build tools write directly under any `node_modules` directory. Each holds generated
// output rather than an installed package, and its contents can change on every build.
//
// Add a directory only once it has been seen in a real stats graph. Never add a package store:
// `.pnpm`, `.bun` and `.deno` hold real packages, and treating them as generated would hide a
// dependency upgrade. Likewise `.vite/deps` holds pre-bundled copies of real packages. When unsure,
// leave a directory out: hashing generated output only costs recaptures, while skipping a package
// misses visual changes.
const GENERATED_NODE_MODULES_DIRECTORIES = new Set([
  // Module federation's generated entries, renamed by content hash on every build.
  '.federation',
]);

// Whether any `node_modules` segment of a path leads directly into a generated directory. Matched on
// whole segments with either separator.
function isGeneratedNodeModulesPath(filePath: string): boolean {
  const segments = filePath.split(/[\\/]/);
  return segments.some(
    (segment, index) =>
      segment === 'node_modules' && GENERATED_NODE_MODULES_DIRECTORIES.has(segments[index + 1])
  );
}

/**
 * Whether a path lies inside an installed package: it passes through a `node_modules` directory,
 * and no `node_modules` segment along it leads into a directory build tools generate there (such as
 * `.federation`). Package stores like pnpm's `.pnpm` count as installed packages.
 *
 * @param filePath The path to test, raw or canonical.
 *
 * @returns Whether the path is inside an installed package.
 */
export function isInstalledPackagePath(filePath: string): boolean {
  return isNodeModulesPath(filePath) && !isGeneratedNodeModulesPath(filePath);
}

// A file inside a package in pnpm's virtual store: `node_modules/.pnpm/<dir>/node_modules/<pkg>/…`.
// Captures the separator before `node_modules`, the `.pnpm/<dir>/node_modules/` hop, the store
// directory and the package name (`@scope/name` for a scoped package). Either separator.
const PNPM_STORE_FILE =
  /(^|[\\/])node_modules[\\/](\.pnpm[\\/]([^\\/]+)[\\/]node_modules[\\/])((?:@[^\\/]+[\\/])?[^\\/]+)[\\/]/;
// A file inside a package installed straight into `node_modules` (npm, Yarn classic, or pnpm's
// hoisted links): the first `node_modules/<pkg>/` along the path whose package is not a dot directory.
const PACKAGE_FILE = /(^|[\\/])node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/.][^\\/]*)[\\/]/;

/**
 * Where a file's package sits: the path the package rolls up under, which is its pnpm store path
 * with the `.pnpm/<dir>/node_modules/` hop dropped, and the directory that holds this copy of it.
 *
 * @param filePath The canonical path of the file.
 *
 * @returns The package's roll-up path and copy directory, the length of the hop, and where the hop
 * starts, or undefined when the file is in no package.
 */
function packageCopy(
  filePath: FilePath
): { packagePath: string; copy: string; hopStart: number; hopLength: number } | undefined {
  const store = PNPM_STORE_FILE.exec(filePath);
  if (store) {
    const hopStart = store.index + store[1].length + 'node_modules/'.length;
    return {
      packagePath: filePath.slice(0, hopStart) + store[4],
      copy: store[3],
      hopStart,
      hopLength: store[2].length,
    };
  }
  const installed = PACKAGE_FILE.exec(filePath);
  if (installed) {
    const packageStart = installed.index + installed[1].length + 'node_modules/'.length;
    return {
      packagePath: filePath.slice(0, packageStart) + installed[2],
      copy: '',
      hopStart: 0,
      hopLength: 0,
    };
  }
  return undefined;
}

/**
 * Builds the path a file takes inside a roll-up. A roll-up names each file by path and content
 * hash (see `rollUpEntryHashes`); this drops pnpm's store directory from the path of a package that
 * has exactly one copy in the build, so `node_modules/.pnpm/<dir>/node_modules/<pkg>/<subpath>`
 * rolls up as `node_modules/<pkg>/<subpath>`. Every other path is returned unchanged.
 *
 * pnpm names the store directory after the package's version and its resolved peers, and shortens a
 * long name to a hash. A peer changing renames the directory and so every file path under it, while
 * the package's bytes stay identical. A rename of `storybook`'s directory after a bump of its
 * `@types/react` peer would otherwise move every roll-up and recapture every story, though nothing
 * that renders changed.
 *
 * What keeps ignoring the rename safe:
 * - The content hash stays in every entry, so a new version of a package, or of a peer that is
 *   bundled, still moves the roll-up through its own files.
 * - A peer that is not bundled (types, test tooling) changes no output byte.
 * - The directory is dropped only when the build holds a single copy of the package. A rename can
 *   also split a package into two copies with identical bytes but separate module state, as when
 *   a story's `@emotion/react` stops seeing the `ThemeProvider` preview renders from the other
 *   copy. Those files keep their real paths, so a copy appearing or disappearing moves the
 *   roll-ups, including when the copies land in different roll-ups. Copies are counted per
 *   package, not per file, because a package split across copies breaks the same way. A copy
 *   installed straight into `node_modules/<pkg>` counts too, so no rewritten path can collide with
 *   a real one.
 * - Bundlers inline no store path into what renders: Vite's output is byte-identical across the
 *   rename. webpack inlines a bare `import.meta.url` as the absolute path, which only matters when
 *   a story renders that string.
 *
 * Only roll-up identities use this. Manifest keys (`files`, `storyFiles`, `skippedFiles`) keep the
 * real path, so a story file's identity still follows its location. Other layouts are out of scope:
 * npm and Yarn classic paths never pass through `.pnpm`, and there a moved package is often a real
 * second copy.
 *
 * @param filePaths Every on-disk file in the build, keyed by canonical path. Copies are counted
 * across all of them, not per roll-up.
 *
 * @returns The path to roll a file up under.
 */
export function buildRollUpPath(filePaths: Iterable<FilePath>): (filePath: FilePath) => FilePath {
  const copiesByPackage = new Map<string, Set<string>>();
  for (const filePath of filePaths) {
    const located = packageCopy(filePath);
    if (!located) continue;
    const copies = copiesByPackage.get(located.packagePath) ?? new Set();
    copiesByPackage.set(located.packagePath, copies.add(located.copy));
  }

  return (filePath) => {
    const located = packageCopy(filePath);
    if (!located?.hopLength || copiesByPackage.get(located.packagePath)?.size !== 1) {
      return filePath;
    }
    return (
      filePath.slice(0, located.hopStart) + filePath.slice(located.hopStart + located.hopLength)
    );
  };
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
