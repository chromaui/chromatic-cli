import { Stats } from '../../../../types';
import { normalizeStatsPath } from '../paths';
import { ManifestInput } from '../projectFiles';
import { FileHash, FilePath, StorybookFileKey } from '../rollUps';
import { SkipReason, SkipRule } from '../skippedFiles';
import { collectTransitiveDependencies, rollUpFileHashes, TurboSnapFile } from './graph';
import { readStatsGraph } from './statsGraph';
import { collectStorybookFiles, FileAttribution } from './storybookFiles';

/** The part of {@link ManifestInput} hashing the graph files reads. */
export type GraphFilesInput = Pick<
  ManifestInput,
  'log' | 'projectRoot' | 'statsRoot' | 'configDir' | 'projectFiles'
>;

/** What the graph files hash to, and the diagnostic records the manifest writes beside them. */
export interface GraphFileHashes {
  /** Rolled-up hash per story file, covering only that story's own transitive subtree. */
  storyFileHashes: Map<FilePath, FileHash>;
  /** The `preview` and `storybookGlobals` roll-ups, each omitted when nothing hashed is left in it. */
  storybookConfigHashes: Map<StorybookFileKey, FileHash>;
  /** Which roll-up each hashed file landed in; see {@link FileAttribution}. */
  attribution: FileAttribution;
  /** The unpruned graph, synthetic nodes and skipped files included; see `serializeManifest`. */
  files: Map<FilePath, TurboSnapFile>;
  /** The graph files v2 skipped hashing, each with its reason. */
  skippedFiles: Map<FilePath, SkipReason>;
}

/**
 * Hashes the files the bundler's stats file names: reads the stats into a canonical graph, then
 * rolls it up per story and into the Storybook-wide `preview` and `storybookGlobals` entries.
 * Everything that knows how a builder spells a module stays behind this function.
 *
 * @param stats The stats file to parse.
 * @param input Where the project is and what to read it with; see {@link GraphFilesInput}.
 * @param skipRule Which on-disk files to leave unhashed; see `buildSkipRule`.
 * @param h64ToString The hash function.
 *
 * @returns The roll-ups, and the graph and records they were computed from.
 */
export async function hashGraphFiles(
  stats: Stats,
  input: GraphFilesInput,
  skipRule: SkipRule,
  h64ToString: (input: string) => string
): Promise<GraphFileHashes> {
  const { files, hashes, storyFiles, globalRoots, skippedFiles, untracedSubtrees } =
    await readStatsGraph(stats, input, skipRule);
  input.log.debug(`Found ${storyFiles.size} story files from preview-stats.json`);

  const storyFileHashes = new Map<FilePath, FileHash>();
  for (const storyFile of storyFiles) {
    const subtree = collectTransitiveDependencies(files, storyFile);
    storyFileHashes.set(storyFile, rollUpFileHashes(hashes, subtree, h64ToString));
  }

  const { storybookConfigHashes, attribution } = collectStorybookFiles(
    files,
    hashes,
    storyFiles,
    normalizeStatsPath(input.configDir, input.projectRoot),
    globalRoots,
    untracedSubtrees,
    h64ToString
  );
  input.log.debug(
    `Attributed ${attribution.previewSubtree.size} files to the preview config subtree`
  );
  input.log.debug(
    `Found ${attribution.storybookGlobals.size} files in Storybook globals (files that could impact rendering across the entire Storybook)`
  );

  return { storyFileHashes, storybookConfigHashes, attribution, files, skippedFiles };
}
