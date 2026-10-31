import path from 'path';

import { AbsolutePath } from '../../../types';
import { MAIN_CONFIG_PATTERN } from '../../getStorybookMetadata';
import { isDocumentationFile } from '../../utilities';
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

/** The part of {@link ManifestInput} the out-of-graph sweep reads: where to look, and what with. */
export type OutOfGraphInput = Pick<
  ManifestInput,
  'log' | 'projectRoot' | 'gitRoot' | 'configDir' | 'staticDirs' | 'externals' | 'projectFiles'
>;

/** What the sweep found: the hashed files, and the config and static files it left unhashed instead. */
export interface OutOfGraphSweep {
  files: OutOfGraphFiles;
  skippedFiles: Map<FilePath, SkipReason>;
}

/**
 * The content hash of every out-of-graph file, keyed by canonical manifest path. These are the S3-only
 * debug detail sections behind the {@link STORYBOOK_CONFIG_KEY}, {@link STATIC_FILES_KEY} and
 * {@link EXTERNALS_KEY} roll-ups: the Index does one equality check per roll-up, and the debug view
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
 * Content-hashes every file in the Storybook config directory, every file in the configured static
 * directories, and every git-tracked file matching the user's `--externals` globs.
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
 * We hash bytes rather than following imports. A change to a file that `main.ts` imports from outside
 * the config directory is missed — and missed by v1 too, so it is parity — while following those
 * imports would mean resolving and interpreting Node-side config, which is out of scope.
 *
 * Static files are hashed unbounded, with no size or count cap: a cap is a silent gap, which is the
 * failure mode this mechanism exists to remove. The files v2 skips are the one exception, in the
 * config directory as in a static directory; see {@link buildSkipRule} for which those are. The main
 * config is hashed whatever the rule says; see {@link hashMainConfigRegardless}.
 *
 * @param input Where to look and what to read it with; see {@link OutOfGraphInput}.
 * @param skipRule Which config and static files to leave unhashed; see {@link buildSkipRule}.
 *
 * @returns The content hash of every config file, static file and external file, keyed by canonical
 * manifest path, beside the swept config and static files that were skipped instead, keyed the same
 * way with the reason. `storybookConfigFiles` is never empty: it always holds at least the main
 * config.
 *
 * @throws {MissingStorybookConfigError} When `configDir` holds no `main.*` file.
 */
export async function hashOutOfGraphFiles(
  input: OutOfGraphInput,
  skipRule: SkipRule
): Promise<OutOfGraphSweep> {
  const configTree = input.projectFiles.listTree(input.configDir);
  if (!configTree.some((filePath) => isMainConfigFile(filePath, input.configDir))) {
    throw new MissingStorybookConfigError(input.configDir);
  }

  // Documentation in the config dir (e.g. `.storybook/README.md`) shouldn't affect the built
  // Storybook, so it stays out of the config roll-up.
  const { hashable: configFilePaths, skipped: skippedConfigFiles } = partitionSkipped(
    configTree.filter((filePath) => !isDocumentationFile(filePath)),
    hashMainConfigRegardless(skipRule, input)
  );
  const staticTree = input.staticDirs.flatMap((directory) =>
    input.projectFiles.listTree(directory)
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
 * The rule as the config sweep applies it: the main config is hashed whatever the rule says. It is
 * the file that makes the directory a config directory, so the config section always has it, and an
 * `--untraced` glob wide enough to catch it, or a main config not yet added to git, is more likely an
 * accident than a request. The case is logged so we can see whether anyone hits it.
 *
 * @param skipRule The rule for every other file; see {@link buildSkipRule}.
 * @param input Where the config directory is, and where to log.
 *
 * @returns The rule for the config sweep.
 */
function hashMainConfigRegardless(
  skipRule: SkipRule,
  input: Pick<OutOfGraphInput, 'log' | 'configDir'>
): SkipRule {
  return (absolutePath) => {
    const reason = skipRule(absolutePath);
    if (reason && isMainConfigFile(absolutePath, input.configDir)) {
      input.log.debug(
        `Hashing ${absolutePath} although it is ${reason}; the main Storybook config is never skipped`
      );
      return undefined;
    }
    return reason;
  };
}

/**
 * Lists the git-tracked files matching the user's `--externals` globs; see
 * {@link gitRootGlobMatcher} for how a glob is read. The skip rule does not reach here: a file both
 * untraced and external still moves the externals roll-up, as in v1, where an external changed file
 * bails before the trace applies `--untraced`. The index is matched as it streams in, so only the
 * matches are ever held: a monorepo's index can run to millions of entries, and a glob names a
 * handful.
 *
 * @param input Where the repository is and which globs to match; see {@link OutOfGraphInput}.
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
 * `storybookGlobals` roll-up is omitted when empty. The config section always contributes one, because
 * {@link hashOutOfGraphFiles} refuses to build it without the main config and never drops the main
 * config into another section, which is what keeps the Index's required `storybookConfigFiles`
 * satisfied.
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
 * @returns The synthetic `storybookConfigHashes` entries, keyed by {@link STORYBOOK_CONFIG_KEY},
 * {@link STATIC_FILES_KEY} and {@link EXTERNALS_KEY}.
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
      .filter(([, files]) => files.size > 0)
      .map(([key, files]) => [key, rollUpEntryHashes([...files], h64ToString)])
  );
}

function isMainConfigFile(filePath: string, configDirectory: string): boolean {
  return (
    path.dirname(filePath) === configDirectory && MAIN_CONFIG_PATTERN.test(path.basename(filePath))
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
