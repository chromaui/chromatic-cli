import path from 'path';
import xxHashWasm from 'xxhash-wasm';

import { Stats } from '../../../types';
import {
  collectTransitiveDependencies,
  FileHash,
  FilePath,
  hashEntryIdentities,
  rollUpFileHashes,
  TurboSnapFile,
} from './graph';
import { ManifestInput } from './manifestInput';
import { hashOutOfGraphFiles, OutOfGraphFiles, rollUpOutOfGraphFiles } from './outOfGraphFiles';
import { normalizeStatsPath } from './paths';
import { ProjectFiles } from './projectFiles';
import { SkipReason } from './skippedFiles';
import { readStatsGraph } from './statsGraph';
import { STORYBOOK_VERSION_KEY, StorybookFileKey } from './storybookFileKeys';
import { collectStorybookFiles, FileAttribution } from './storybookFiles';
import { resolveStorybookVersion } from './storybookVersion';

type StorybookVersion = string;

/**
 * The TurboSnap manifest holds the hash of every file in the Storybook project and the dependencies
 * of each file, along with the derived per-story, Storybook-config and whole-Storybook hashes. This
 * is uploaded as a static file to S3 for debugging purposes.
 */
export interface TurboSnapManifest {
  /* The rolled-up hash of the entire Storybook, covering every file located in the manifest. */
  storybookHash: string;
  /**
   * A rolled-up hash for each Storybook-wide category: the `preview` subtree, the `storybookGlobals`
   * roll-up, the `storybookConfigFiles`, `staticFiles` and `externals` out-of-graph sweeps, and the
   * Storybook version (the plain version string, not a hash of it).
   */
  storybookConfigHashes: Map<StorybookFileKey, FileHash | StorybookVersion>;
  /** Rolled-up hash per story file, covering only that story's own transitive subtree. */
  storyFileHashes: Map<FilePath, FileHash>;
  /**
   * Which hashing home each real file landed in (story subtree, preview subtree, or the globals
   * roll-up). A diagnostic record for the S3 manifest; it feeds no hash.
   */
  attribution: FileAttribution;
  /**
   * The per-file detail behind the out-of-graph roll-ups, serialized as the top-level
   * `storybookConfigFiles`, `staticFiles` and `externals` maps.
   */
  outOfGraphFiles: OutOfGraphFiles;
  /**
   * The unpruned graph parsed from `preview-stats.json`, including synthetic transit nodes used by
   * roll-ups. Synthetic nodes are omitted only when the manifest is serialized; files v2 skipped
   * stay, hashed as `SKIPPED_HASH`, so the written graph keeps the edges that run through them.
   */
  files: Map<FilePath, TurboSnapFile>;
  /**
   * The on-disk files, in the graph or swept, that v2 skipped hashing, each with its reason; see
   * `findSkippedFiles`. A diagnostic record for the S3 manifest; it feeds no hash.
   */
  skippedFiles: Map<FilePath, SkipReason>;
}

/**
 * The manifest shape written to disk: the whole-Storybook hash, the per-story hashes, the
 * Storybook-config hashes, and the hash and dependencies of every source file.
 *
 * Note: This is a separate type than TurboSnapManifest because we're writing to a file and need to
 * use JSON-safe types like arrays and objects instead of sets and maps.
 */
interface ManifestFile {
  storybookHash: string;
  storybookConfigHashes: Record<FilePath, FileHash | StorybookVersion>;
  storybookConfigFiles: Record<FilePath, FileHash>;
  staticFiles: Record<FilePath, FileHash>;
  externals: Record<FilePath, FileHash>;
  storyFiles: Record<FilePath, FileHash>;
  attribution: Record<keyof FileAttribution, FilePath[]>;
  files: Record<FilePath, { hash: FileHash; dependencies: FilePath[] }>;
  skippedFiles: Record<FilePath, SkipReason>;
}

/**
 * Rolls the graph a stats file describes up into a TurboSnap manifest: the per-story hashes, the
 * Storybook-wide hashes and the whole-Storybook gate. Reading the stats file is
 * {@link readStatsGraph}'s job; everything here works in canonical paths.
 *
 * @param stats The stats file to parse.
 * @param input Where the project is and what to read it with; see {@link ManifestInput}.
 *
 * @returns The manifest containing the file hashes, story file hashes, Storybook config file hashes,
 * and Storybook hash.
 */
export async function buildManifest(
  stats: Stats,
  input: ManifestInput
): Promise<TurboSnapManifest> {
  const {
    files,
    hashes,
    storyFiles,
    globalRoots,
    skippedFiles: skippedGraphFiles,
  } = await readStatsGraph(stats, input);
  input.log.debug(`Found ${storyFiles.size} story files from preview-stats.json`);

  const { h64ToString } = await xxHashWasm();
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
    h64ToString
  );
  input.log.debug(
    `Attributed ${attribution.previewSubtree.size} files to the preview config subtree`
  );
  input.log.debug(
    `Found ${attribution.storybookGlobals.size} files in Storybook globals (files that could impact rendering across the entire Storybook)`
  );

  // The preview core runtime may not exist in the module graph, so no file hash can see a Storybook
  // upgrade there. Track the version instead; it is a plain string, not a hash.
  storybookConfigHashes.set(STORYBOOK_VERSION_KEY, resolveStorybookVersion(input));

  // Storybook's config directory, static assets and the user's externals are never bundler inputs, so
  // nothing above can see them change. They get their own roll-ups; see rollUpOutOfGraphFiles.
  const { outOfGraphFiles, skippedFiles: skippedStaticFiles } = await hashOutOfGraphFiles(input);
  for (const [key, hash] of rollUpOutOfGraphFiles(outOfGraphFiles, h64ToString)) {
    storybookConfigHashes.set(key, hash);
  }
  input.log.debug(
    `Hashed ${outOfGraphFiles.staticFiles.size} static files in ${input.staticDirs.join(', ')}`
  );
  input.log.debug(
    `Hashed ${outOfGraphFiles.storybookConfigFiles.size} storybook config files in ${input.configDir}`
  );
  input.log.debug(
    `Hashed ${outOfGraphFiles.externals.size} external files from ${input.externals.length} --externals globs`
  );
  const skippedFiles = new Map([...skippedGraphFiles, ...skippedStaticFiles]);
  input.log.debug(
    `Skipped hashing ${skippedFiles.size} files; the manifest's skippedFiles lists each with its reason`
  );

  // The backend's top-level "did Storybook change at all?" gate: the key and hash of every story
  // file plus every `storybookConfigHashes` entry, so additions, removals and renames are all visible
  // before the backend drills into the maps.
  const storybookHash = h64ToString(
    hashEntryIdentities(storyFileHashes) + hashEntryIdentities(storybookConfigHashes)
  );

  return {
    storybookHash,
    storybookConfigHashes,
    storyFileHashes,
    attribution,
    outOfGraphFiles,
    files,
    skippedFiles,
  };
}

/**
 * Converts the in-memory manifest (which uses Maps and Sets) into the JSON-safe shape written to
 * disk. Shared by writeManifest and the `turbosnap-manifest` CLI command so both emit an identical
 * structure.
 *
 * @param manifest The manifest to serialize.
 *
 * @returns The JSON-safe manifest object.
 */
export function serializeManifest(manifest: TurboSnapManifest): ManifestFile {
  return {
    storybookHash: manifest.storybookHash,
    storybookConfigHashes: sortByKey(Object.fromEntries(manifest.storybookConfigHashes)),
    storybookConfigFiles: sortByKey(
      Object.fromEntries(manifest.outOfGraphFiles.storybookConfigFiles)
    ),
    staticFiles: sortByKey(Object.fromEntries(manifest.outOfGraphFiles.staticFiles)),
    externals: sortByKey(Object.fromEntries(manifest.outOfGraphFiles.externals)),
    storyFiles: sortByKey(Object.fromEntries(manifest.storyFileHashes)),
    attribution: sortByKey(
      Object.fromEntries(
        Object.entries(manifest.attribution).map(([key, filePaths]) => [
          key,
          [...filePaths].sort(comparePaths),
        ])
      )
    ) as ManifestFile['attribution'],
    files: sortByKey(serializeFiles(manifest.files)),
    skippedFiles: sortByKey(Object.fromEntries(manifest.skippedFiles)),
  };
}

/**
 * Serializes the graph without its synthetic nodes: an empty hash means there is no file on disk. A
 * skipped file keeps its sentinel hash and stays: it is a real file that a story can import tracked
 * files through, so the written graph keeps that path visible.
 *
 * @param files The unpruned graph.
 *
 * @returns The graph of real files, each with its hash and the real files it depends on.
 */
function serializeFiles(files: Map<FilePath, TurboSnapFile>): ManifestFile['files'] {
  const isRealFile = (filePath: FilePath) => Boolean(files.get(filePath)?.hash);

  const serialized: ManifestFile['files'] = {};
  for (const [filePath, file] of files) {
    if (!isRealFile(filePath)) continue;
    serialized[filePath] = {
      hash: file.hash,
      dependencies: [...file.dependencies]
        .filter((dependency) => isRealFile(dependency))
        .sort(comparePaths),
    };
  }
  return serialized;
}

function sortByKey<Value>(record: Record<string, Value>): Record<string, Value> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => comparePaths(a, b)));
}

function comparePaths(a: FilePath, b: FilePath): number {
  return a.localeCompare(b);
}

/**
 * Locates the serialized Manifest inside a Storybook build directory. The Manifest lives in the
 * internal `.chromatic` directory, which is excluded from the build upload and uploaded separately
 * as build metadata.
 *
 * @param sourceDirectory The Storybook build output directory.
 *
 * @returns The absolute Manifest path.
 */
export function getManifestPath(sourceDirectory: string): string {
  return path.join(sourceDirectory, '.chromatic', 'turbosnap-manifest.json');
}

/**
 * Writes the entire manifest to a file. This is uploaded to S3 for debugging.
 *
 * @param manifest The manifest to write.
 * @param manifestPath The path to write the manifest file to.
 * @param projectFiles How to write the disk.
 */
export function writeManifest(
  manifest: TurboSnapManifest,
  manifestPath: string,
  projectFiles: ProjectFiles
) {
  projectFiles.writeFile(manifestPath, JSON.stringify(serializeManifest(manifest)));
}
