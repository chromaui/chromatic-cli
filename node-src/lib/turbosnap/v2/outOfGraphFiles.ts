import path from 'path';

import { MAIN_CONFIG_PATTERN } from '../../getStorybookMetadata';
import { isDocumentationFile } from '../../utilities';
import { FileHash, FilePath, rollUpEntryHashes } from './graph';
import { ManifestInput } from './manifestInput';
import { normalizeStatsPath } from './paths';
import { ProjectFiles } from './projectFiles';
import { STATIC_FILES_KEY, STORYBOOK_CONFIG_KEY, StorybookFileKey } from './storybookFileKeys';

/** The part of {@link ManifestInput} the out-of-graph sweep reads: where to look, and what with. */
export type OutOfGraphInput = Pick<
  ManifestInput,
  'projectRoot' | 'configDir' | 'staticDirs' | 'projectFiles'
>;

/**
 * The content hash of every out-of-graph file, keyed by canonical manifest path. These are the S3-only
 * debug detail sections behind the {@link STORYBOOK_CONFIG_KEY} and {@link STATIC_FILES_KEY} roll-ups:
 * the Index does one equality check per roll-up, and the debug view diffs these to name the file that
 * actually moved.
 */
export interface OutOfGraphFiles {
  storybookConfigFiles: Map<FilePath, FileHash>;
  staticFiles: Map<FilePath, FileHash>;
}

/**
 * Thrown when the Storybook config directory holds no `main.*` file. Storybook requires that file,
 * so a directory without one is not a valid Storybook config directory.
 */
export class MissingStorybookConfigError extends Error {
  constructor(public readonly configDirectory: string) {
    super(`No Storybook main config file found in ${configDirectory}`);
    this.name = 'MissingStorybookConfigError';
  }
}

/**
 * Content-hashes every file in the Storybook config directory and every file in the configured static
 * directories.
 *
 * These files are structurally invisible to v2's graph hashing — `.storybook/main.ts` is Node-side
 * config and static assets are referenced by URL string, so neither is ever a module in
 * `preview-stats.json`. Without this, an edit to either produces a byte-identical manifest, where
 * TurboSnap v1 bails and recaptures everything. Hashing bytes off disk covers them regardless of
 * whether the builder emitted a module, which is also what closes the empty-`preview.ts` case (a
 * 0-line preview is elided by vite, so it has no graph-rolled entry at all).
 *
 * We hash bytes rather than following imports. A change to a file that `main.ts` imports from outside
 * the config directory is missed — and missed by v1 too, so it is parity — while following those
 * imports would mean resolving and interpreting Node-side config, which is out of scope.
 *
 * Static files are hashed unbounded, with no size or count cap: a cap is a silent gap, which is the
 * failure mode this mechanism exists to remove.
 *
 * @param input Where to look and what to read it with; see {@link OutOfGraphInput}.
 *
 * @returns The content hash of every config file and every static file, keyed by canonical manifest
 * path. `storybookConfigFiles` is never empty: it always holds at least the main config.
 *
 * @throws {MissingStorybookConfigError} When `configDir` holds no `main.*` file.
 */
export async function hashOutOfGraphFiles(input: OutOfGraphInput): Promise<OutOfGraphFiles> {
  const configPaths = input.projectFiles.listTree(input.configDir);
  if (!configPaths.some((filePath) => isMainConfigFile(filePath, input.configDir))) {
    throw new MissingStorybookConfigError(input.configDir);
  }

  const staticFilePaths = input.staticDirs.flatMap((directory) =>
    input.projectFiles.listTree(directory)
  );

  return {
    // A config file inside a declared static dir stays a config file, so the config section is
    // never emptied by `staticDirs` pointing at the config dir. It lands in both sections.
    // Documentation in the config dir (e.g. `.storybook/README.md`) shouldn't affect the built
    // Storybook, so it stays out of the config roll-up.
    storybookConfigFiles: await hashByManifestPath(
      configPaths.filter((filePath) => !isDocumentationFile(filePath)),
      input.projectRoot,
      input.projectFiles
    ),
    staticFiles: await hashByManifestPath(staticFilePaths, input.projectRoot, input.projectFiles),
  };
}

/**
 * Rolls each out-of-graph section up into the single `storybookConfigHashes` entry the Index compares.
 *
 * The two sections are deliberately independent of each other and of `.storybook/preview.*`'s
 * graph-rolled entry: bytes-changed and imports-changed are different failure modes, so `preview.*` is
 * covered twice on purpose and neither entry has to be complete alone.
 *
 * The static section contributes no entry when it has no files, matching how the `storybookGlobals`
 * roll-up is omitted when empty. The config section always contributes one, because
 * {@link hashOutOfGraphFiles} refuses to build it without the main config and never drops the main
 * config into another section, which is what keeps the Index's required `storybookConfigFiles`
 * satisfied.
 *
 * Both roll-ups are path-sensitive, as the graph-rolled entries now are too: a static asset is served
 * at its path and a config file is loaded by name, so a byte-preserving rename changes what Storybook
 * renders even though the multiset of contents is untouched. The path identity hashed is the
 * canonical manifest key, which is project-relative — so a project move leaves both roll-ups still,
 * the assets being served at the same URLs and the config still loading from the same names, and only
 * a rename *within* the project is a real change.
 *
 * @param outOfGraphFiles The per-file hashes to roll up.
 * @param h64ToString The hash function.
 *
 * @returns The synthetic `storybookConfigHashes` entries, keyed by {@link STORYBOOK_CONFIG_KEY} and
 * {@link STATIC_FILES_KEY}.
 */
export function rollUpOutOfGraphFiles(
  outOfGraphFiles: OutOfGraphFiles,
  h64ToString: (input: string) => string
): Map<StorybookFileKey, FileHash> {
  const sections = [
    [STORYBOOK_CONFIG_KEY, outOfGraphFiles.storybookConfigFiles],
    [STATIC_FILES_KEY, outOfGraphFiles.staticFiles],
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
