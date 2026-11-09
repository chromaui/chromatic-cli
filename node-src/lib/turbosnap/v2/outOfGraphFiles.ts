import { AbsolutePath } from '../../../types';
import { isMainConfigFile, storybookConfigFileKind } from '../storybookConfigFiles';
import { FileHash, FilePath, rollUpEntryHashes } from './graph';
import { ManifestInput } from './manifestInput';
import { gitRootGlobMatcher, normalizeStatsPath } from './paths';
import { ProjectFiles } from './projectFiles';
import { partitionSkipped, SkipReason, SkipRule } from './skippedFiles';
import {
  EXTERNALS_KEY,
  STATIC_FILES_KEY,
  STORYBOOK_CONFIG_KEY,
  StorybookFileKey,
} from './storybookFileKeys';

/** The part of `ManifestInput` the out-of-graph sweep reads: where to look, and what with. */
export type OutOfGraphInput = Pick<
  ManifestInput,
  | 'log'
  | 'projectRoot'
  | 'gitRoot'
  | 'configDir'
  | 'e2ePackage'
  | 'staticDirs'
  | 'externals'
  | 'projectFiles'
>;

/** What the sweep found: the hashed files, and the config and static files it left unhashed instead. */
export interface OutOfGraphSweep {
  files: OutOfGraphFiles;
  skippedFiles: Map<FilePath, SkipReason>;
}

/**
 * The content hash of every out-of-graph file, keyed by canonical manifest path. These are the S3-only
 * debug detail sections behind the `STORYBOOK_CONFIG_KEY`, `STATIC_FILES_KEY` and
 * `EXTERNALS_KEY` roll-ups: the Index does one equality check per roll-up, and the debug view
 * diffs these to name the file that actually moved.
 */
export interface OutOfGraphFiles {
  storybookConfigFiles: Map<FilePath, FileHash>;
  staticFiles: Map<FilePath, FileHash>;
  externals: Map<FilePath, FileHash>;
}

/**
 * Thrown when the Storybook config directory holds no `main.*` file. Storybook requires that file, so
 * a directory without one is not a valid Storybook config directory.
 */
export class MissingStorybookConfigError extends Error {
  constructor(public readonly configDirectory: string) {
    super(`No Storybook main config file found in ${configDirectory}`);
    this.name = 'MissingStorybookConfigError';
  }
}

/**
 * Collects the config and static paths that will be checked against git. The config sweep keeps only
 * the allowlisted config files; see `storybookConfigFileKind`.
 *
 * @param input The config and static locations and disk for this build.
 *
 * @returns The paths in each sweep.
 *
 * @throws {MissingStorybookConfigError} When `configDir` holds no `main.*` file, unless the build is
 * an E2E build.
 */
export function listConfigAndStaticFiles(input: OutOfGraphInput) {
  return {
    // An E2E build has no config directory to sweep; see `ManifestInput.e2ePackage`.
    configTree: input.e2ePackage ? [] : listConfigTree(input),
    staticTree: input.staticDirs.flatMap((directory) => input.projectFiles.listTree(directory)),
  };
}

function listConfigTree(input: Pick<OutOfGraphInput, 'configDir' | 'projectFiles'>) {
  const configTree = input.projectFiles
    .listTree(input.configDir)
    .filter((filePath) => storybookConfigFileKind(filePath, input.configDir));
  if (!configTree.some((filePath) => isMainConfigFile(filePath, input.configDir))) {
    throw new MissingStorybookConfigError(input.configDir);
  }
  return configTree;
}

/**
 * Content-hashes the allowlisted files in the Storybook config directory (`main.*`, `preview.*`,
 * `preview-head.html` and `preview-body.html`), every file in the configured static directories, and
 * every git-tracked file matching the user's `--externals` globs.
 *
 * These files are structurally invisible to v2's graph hashing — `.storybook/main.ts` is Node-side
 * config and static assets are referenced by URL string, so neither is ever a module in
 * `preview-stats.json`. Without this, an edit to either produces a byte-identical manifest, where
 * TurboSnap v1 bails and recaptures everything. Hashing bytes off disk covers them regardless of
 * whether the builder emitted a module, which is also what closes the empty-`preview.ts` case (a
 * 0-line preview is elided by vite, so it has no graph-rolled entry at all).
 *
 * Externals are the user's own list of such files, which is why they are matched against the git
 * index rather than the graph: a Tailwind or PostCSS config is exactly the kind of file a user names,
 * and exactly the kind the bundler never emits a module for. A glob that matches nothing contributes
 * nothing, so a project without externals is unchanged.
 *
 * We hash bytes rather than following imports. A change to a file that only `main.ts` imports, such
 * as a local preset or a `webpackFinal` helper, is missed wherever it lives, in the config directory
 * or outside it. v1 misses it too, so it is parity. Following those imports would mean resolving and
 * interpreting Node-side config, which is out of scope.
 *
 * Static files are hashed unbounded, with no size or count cap: a cap is a silent gap, which is the
 * failure mode this mechanism exists to remove. The files v2 skips are the one exception, in the
 * config directory as in a static directory; see `buildSkipRule` for which those are.
 *
 * Every other file in the config directory is left out of the sweep, and isn't listed as skipped
 * either: it isn't a config file. When a story or preview file imports it, the graph pass hashes it
 * into whichever story or preview subtree reaches it. When only `main.ts` imports it, nothing does
 * (see above).
 *
 * @param input Where to look and what to read it with; see `OutOfGraphInput`.
 * @param skipRule Which config and static files to leave unhashed; see `buildSkipRule`.
 * @param inventory The config and static files, from `listConfigAndStaticFiles`; the same
 * inventory the skip rule was built from.
 *
 * @returns The content hash of every config file, static file and external file, keyed by canonical
 * manifest path, beside the swept config and static files that were skipped instead, keyed the same
 * way with the reason. `storybookConfigFiles` always holds at least the main config, which
 * `buildSkipRule` never skips, except for an E2E build, where it is empty.
 */
export async function hashOutOfGraphFiles(
  input: OutOfGraphInput,
  skipRule: SkipRule,
  inventory: ReturnType<typeof listConfigAndStaticFiles>
): Promise<OutOfGraphSweep> {
  const { configTree, staticTree } = inventory;

  const { hashable: configFilePaths, skipped: skippedConfigFiles } = partitionSkipped(
    configTree,
    skipRule
  );
  const { hashable: staticFilePaths, skipped: skippedStaticFiles } = partitionSkipped(
    staticTree,
    skipRule
  );

  return {
    files: {
      // A config file inside a declared static dir stays a config file, so the config section is
      // never emptied by `staticDirs` pointing at the config dir. It lands in both sections.
      storybookConfigFiles: await hashByManifestPath(
        configFilePaths,
        input.projectRoot,
        input.projectFiles
      ),
      staticFiles: await hashByManifestPath(staticFilePaths, input.projectRoot, input.projectFiles),
      externals: await hashByManifestPath(
        await listExternalFiles(input),
        input.projectRoot,
        input.projectFiles
      ),
    },
    skippedFiles: new Map(
      [...skippedConfigFiles, ...skippedStaticFiles].map(([absolutePath, reason]) => [
        normalizeStatsPath(absolutePath, input.projectRoot),
        reason,
      ])
    ),
  };
}

/**
 * Lists the git-tracked files matching the user's `--externals` globs; see
 * `gitRootGlobMatcher` for how a glob is read. The skip rule does not reach here: a file both
 * untraced and external still moves the externals roll-up, as in v1, where an external changed file
 * bails before the trace applies `--untraced`. The index is matched as it streams in, so only the
 * matches are ever held: a monorepo's index can run to millions of entries, and a glob names a
 * handful.
 *
 * @param input Where the repository is and which globs to match; see `OutOfGraphInput`.
 *
 * @returns The absolute path of every matching file that exists on disk.
 */
async function listExternalFiles(
  input: Pick<OutOfGraphInput, 'log' | 'gitRoot' | 'externals' | 'projectFiles'>
): Promise<AbsolutePath[]> {
  const { log, gitRoot, externals, projectFiles } = input;
  if (!externals.some(Boolean)) {
    return [];
  }

  const isExternal = gitRootGlobMatcher(gitRoot, externals);

  const start = Date.now();
  let indexedPaths = 0;
  const externalFiles: AbsolutePath[] = [];
  for await (const absolutePath of projectFiles.trackedFiles(gitRoot, externals)) {
    indexedPaths += 1;
    // The index can name a file deleted from the working tree or a submodule root; neither has
    // bytes to hash.
    if (isExternal(absolutePath) && projectFiles.isFile(absolutePath)) {
      externalFiles.push(absolutePath);
    }
  }
  log.debug(
    `Matched ${externalFiles.length} external files against ${indexedPaths} indexed paths in ${Date.now() - start}ms`
  );
  return externalFiles;
}

/**
 * Rolls each out-of-graph section up into the single `storybookConfigHashes` entry the Index compares.
 *
 * The sections are deliberately independent of each other and of `.storybook/preview.*`'s
 * graph-rolled entry: bytes-changed and imports-changed are different failure modes, so `preview.*` is
 * covered twice on purpose and neither entry has to be complete alone. Likewise an external that is
 * also in the graph is covered twice: once in whichever subtree imports it, and once here.
 *
 * The static and externals sections contribute no entry when they have no files, matching how the
 * `storybookGlobals` roll-up is omitted when empty. The config section always contributes one,
 * because the Index requires `storybookConfigFiles`. For a Storybook project it is never empty:
 * `listConfigAndStaticFiles` refuses to sweep without the main config, `buildSkipRule` never skips
 * the main config, and `hashOutOfGraphFiles` never drops it into another section. An E2E build has
 * no config directory, so its entry is the roll-up of nothing, a constant; a package upgrade moves
 * `storybookVersion` instead.
 *
 * The roll-ups are path-sensitive, as the graph-rolled entries now are too: a static asset is served
 * at its path and a config file is loaded by name, so a byte-preserving rename changes what Storybook
 * renders even though the multiset of contents is untouched. The path identity hashed is the
 * canonical manifest key, which is project-relative — so a project move leaves the roll-ups still,
 * the assets being served at the same URLs and the config still loading from the same names, and only
 * a rename *within* the project is a real change.
 *
 * @param outOfGraphFiles The per-file hashes to roll up.
 * @param h64ToString The hash function.
 *
 * @returns The synthetic `storybookConfigHashes` entries, keyed by `STORYBOOK_CONFIG_KEY`,
 * `STATIC_FILES_KEY` and `EXTERNALS_KEY`.
 */
export function rollUpOutOfGraphFiles(
  outOfGraphFiles: OutOfGraphFiles,
  h64ToString: (input: string) => string
): Map<StorybookFileKey, FileHash> {
  const sections = [
    [STORYBOOK_CONFIG_KEY, outOfGraphFiles.storybookConfigFiles],
    [STATIC_FILES_KEY, outOfGraphFiles.staticFiles],
    [EXTERNALS_KEY, outOfGraphFiles.externals],
  ] as const;

  return new Map(
    sections
      .filter(([key, files]) => key === STORYBOOK_CONFIG_KEY || files.size > 0)
      .map(([key, files]) => [key, rollUpEntryHashes([...files], h64ToString)])
  );
}

/**
 * Hashes absolute file paths and keys the result by canonical manifest path, matching how `files` is
 * keyed so a manifest reader can compare the two.
 *
 * @param absolutePaths The absolute paths to hash.
 * @param projectRoot The absolute Storybook project root canonical keys are relative to.
 * @param projectFiles How to read the disk.
 *
 * @returns The content hash per canonical manifest path.
 */
async function hashByManifestPath(
  absolutePaths: string[],
  projectRoot: string,
  projectFiles: ProjectFiles
): Promise<Map<FilePath, FileHash>> {
  const hashes = await projectFiles.hashAll(absolutePaths);

  return new Map(
    absolutePaths
      .map((absolutePath): [FilePath, FileHash] => [
        normalizeStatsPath(absolutePath, projectRoot),
        hashes[absolutePath],
      ])
      // Sorted so the debug detail section reads in path order rather than directory-walk order.
      .sort(([a], [b]) => a.localeCompare(b))
  );
}
