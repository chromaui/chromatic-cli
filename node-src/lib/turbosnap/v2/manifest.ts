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
   * catch-all, the `storybookConfigFiles` and `staticFiles` out-of-graph sweeps, and the Storybook
   * version (the plain version string, not a hash of it).
   */
  storybookFileHashes: Map<StorybookFileKey, FileHash | StorybookVersion>;
  /** Rolled-up hash per story file, covering only that story's own transitive subtree. */
  storyFileHashes: Map<FilePath, FileHash>;
  /**
   * Which hashing home each real file landed in (story subtree, preview subtree, or the globals
   * catch-all). A diagnostic record for the S3 manifest; it feeds no hash.
   */
  attribution: FileAttribution;
  /**
   * The per-file detail behind the out-of-graph roll-ups, serialized as the top-level
   * `storybookConfigFiles` and `staticFiles` maps.
   */
  outOfGraphFiles: OutOfGraphFiles;
  /**
   * The unpruned graph parsed from `preview-stats.json`, including synthetic transit nodes used by
   * roll-ups. Synthetic nodes are omitted only when the manifest is serialized.
   */
  files: Map<FilePath, TurboSnapFile>;
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
  storybookFileHashes: Record<FilePath, FileHash | StorybookVersion>;
  storybookConfigFiles: Record<FilePath, FileHash>;
  staticFiles: Record<FilePath, FileHash>;
  storyFiles: Record<FilePath, FileHash>;
  attribution: Record<keyof FileAttribution, FilePath[]>;
  files: Record<FilePath, { hash: FileHash; dependencies: FilePath[] }>;
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
  const { files, hashes, storyFiles } = await readStatsGraph(stats, input);

  const { h64ToString } = await xxHashWasm();
  const storyFileHashes = new Map<FilePath, FileHash>();
  const storyReachable = new Set<FilePath>();

  for (const storyFile of storyFiles) {
    const subtree = collectTransitiveDependencies(files, storyFile);
    storyFileHashes.set(storyFile, rollUpFileHashes(hashes, subtree, h64ToString));

    for (const filePath of subtree) {
      storyReachable.add(filePath);
    }
  }

  const { storybookFileHashes, attribution } = collectStorybookFiles(
    files,
    hashes,
    storyReachable,
    normalizeStatsPath(input.configDir, input.projectRoot),
    h64ToString
  );

  // The preview core runtime may not exist in the module graph, so no file hash can see a Storybook
  // upgrade there. Track the version instead; it is a plain string, not a hash.
  storybookFileHashes.set(
    STORYBOOK_VERSION_KEY,
    resolveStorybookVersion(input.projectRoot, input.projectFiles)
  );

  // Storybook's config directory and static assets are never bundler inputs, so nothing above can see
  // them change. They get their own roll-ups; see rollUpOutOfGraphFiles.
  const outOfGraphFiles = await hashOutOfGraphFiles(input);
  for (const [key, hash] of rollUpOutOfGraphFiles(outOfGraphFiles, h64ToString)) {
    storybookFileHashes.set(key, hash);
  }

  // The backend's top-level "did Storybook change at all?" gate: the key and hash of every story
  // file plus every `storybookFileHashes` entry, so additions, removals and renames are all visible
  // before the backend drills into the maps.
  const storybookHash = h64ToString(
    hashEntryIdentities(storyFileHashes) + hashEntryIdentities(storybookFileHashes)
  );

  return {
    storybookHash,
    storybookFileHashes,
    storyFileHashes,
    attribution,
    outOfGraphFiles,
    files,
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
    storybookFileHashes: sortByKey(Object.fromEntries(manifest.storybookFileHashes)),
    storybookConfigFiles: sortByKey(
      Object.fromEntries(manifest.outOfGraphFiles.storybookConfigFiles)
    ),
    staticFiles: sortByKey(Object.fromEntries(manifest.outOfGraphFiles.staticFiles)),
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
  };
}

function serializeFiles(files: Map<FilePath, TurboSnapFile>): ManifestFile['files'] {
  const serialized: ManifestFile['files'] = {};
  for (const [filePath, file] of files) {
    if (file.hash === '') {
      continue;
    }
    serialized[filePath] = {
      hash: file.hash,
      dependencies: [...file.dependencies]
        .filter((dependency) => files.get(dependency)?.hash)
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
 * Writes the entire manifest to a file in the output directory. This is uploaded to S3 for
 * debugging.
 *
 * @param manifest The manifest to write.
 * @param outputDirectory The directory to write the manifest file to.
 * @param projectFiles How to write the disk.
 */
export function writeManifest(
  manifest: TurboSnapManifest,
  outputDirectory: string,
  projectFiles: ProjectFiles
) {
  projectFiles.writeFile(
    path.join(outputDirectory, 'turbosnap-manifest.json'),
    JSON.stringify(serializeManifest(manifest))
  );
}
