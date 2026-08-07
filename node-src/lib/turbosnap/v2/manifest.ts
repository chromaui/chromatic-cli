import { writeFileSync } from 'fs';
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
import {
  hashOutOfGraphFiles,
  OutOfGraphFiles,
  OutOfGraphInput,
  rollUpOutOfGraphFiles,
} from './outOfGraphFiles';
import { readStatsGraph } from './statsGraph';
import { STORYBOOK_VERSION_KEY } from './storybookFileKeys';
import { collectStorybookFiles, FileAttribution } from './storybookFiles';
import { resolveStorybookVersion } from './storybookVersion';

type StorybookVersion = string;

/**
 * The TurboSnap manifest holds the hash of every file in the Storybook project and the dependencies
 * of each file, along with the derived per-story, Storybook-config and whole-Storybook hashes. This
 * is uploaded as a static file to S3 for debugging purposes.
 */
export interface TurboSnapManifest {
  files: Map<FilePath, TurboSnapFile>;
  /** Rolled-up hash per story file, covering only that story's own transitive subtree. */
  storyFileHashes: Map<FilePath, FileHash>;
  /** Generated entries above a lazy context that are absent from the explicit entry catalogue. */
  unrecognizedStoryEntries: FilePath[];
  /**
   * One entry per `.storybook/preview.*` holding its rolled-up hash, plus the
   * {@link STORYBOOK_GLOBALS_KEY} catch-all, the {@link STORYBOOK_VERSION_KEY} version string and the
   * `storybookConfig` / `staticFiles` out-of-graph roll-ups (see {@link rollUpOutOfGraphFiles}). A
   * change to any entry means recapture everything, so the small map is enough for the backend to
   * decide; the per-file breakdown behind each hash stays in `files` (graph) or in the out-of-graph
   * detail sections for debugging.
   */
  storybookFiles: Map<FilePath, FileHash | StorybookVersion>;
  storybookHash: string;
  /** Where each real file was hashed; see {@link FileAttribution}. */
  attribution: FileAttribution;
  /** The per-file detail behind the out-of-graph roll-ups; see {@link OutOfGraphFiles}. */
  outOfGraphFiles: OutOfGraphFiles;
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
  storybookFiles: Record<FilePath, FileHash | StorybookVersion>;
  storybookConfigFiles: Record<FilePath, FileHash>;
  staticFiles: Record<FilePath, FileHash>;
  storyFiles: Record<FilePath, FileHash>;
  /** The sole evidence for the `unrecognizedStoryEntry` bail, which writes this manifest. */
  unrecognizedStoryEntries: FilePath[];
  attribution: Record<keyof FileAttribution, FilePath[]>;
  files: Record<FilePath, { hash: FileHash; dependencies: FilePath[] }>;
}

/**
 * Rolls the graph a stats file describes up into a TurboSnap manifest: the per-story hashes, the
 * Storybook-wide hashes and the whole-Storybook gate. Reading the stats file is
 * {@link readStatsGraph}'s job; everything here works in canonical paths.
 *
 * @param stats The stats file to parse.
 * @param projectRoot The absolute Storybook project root that module paths anchor against.
 * @param outOfGraph Where to find the Storybook inputs that are never bundler inputs; see
 * {@link OutOfGraphInput}.
 * @param statsRoot The absolute directory relative stats paths are named from. Defaults to the
 * project root.
 *
 * @returns The manifest containing the file hashes, story file hashes, Storybook config file hashes,
 * and Storybook hash.
 */
export async function buildManifest(
  stats: Stats,
  projectRoot: string,
  outOfGraph: OutOfGraphInput,
  statsRoot = projectRoot
): Promise<TurboSnapManifest> {
  const { files, hashes, storyFiles, unrecognizedStoryEntries } = await readStatsGraph(stats, {
    projectRoot,
    statsRoot,
    projectFiles: outOfGraph.projectFiles,
  });

  const { h64ToString } = await xxHashWasm();
  const storyFileHashes = new Map<FilePath, FileHash>();
  for (const storyFile of storyFiles) {
    const subtree = collectTransitiveDependencies(files, storyFile);
    storyFileHashes.set(storyFile, rollUpFileHashes(hashes, subtree, h64ToString));
  }

  const { storybookFiles, attribution } = collectStorybookFiles(
    files,
    hashes,
    storyFiles,
    outOfGraph.configDir,
    h64ToString
  );

  // The preview core runtime is out of the module graph on webpack and rspack, so no file hash can
  // see a Storybook upgrade there. Track the version instead; it is a plain string, not a hash.
  storybookFiles.set(
    STORYBOOK_VERSION_KEY,
    resolveStorybookVersion(projectRoot, outOfGraph.projectFiles)
  );

  // Storybook's config directory and static assets are never bundler inputs, so nothing above can see
  // them change. They get their own roll-ups; see rollUpOutOfGraphFiles.
  const outOfGraphFiles = await hashOutOfGraphFiles(outOfGraph, projectRoot);
  for (const [key, hash] of rollUpOutOfGraphFiles(outOfGraphFiles, h64ToString)) {
    storybookFiles.set(key, hash);
  }

  // The backend's top-level "did Storybook change at all?" gate: the key and hash of every story
  // file plus every `storybookFiles` entry, so additions, removals and renames are all visible
  // before the backend drills into the maps. A story file's path already reaches its roll-up, which
  // makes including the key redundant; it is here so the gate does not inherit that property from
  // the roll-up recipe. Keys are project-root-relative, so moving the project still moves nothing.
  const storybookHash = h64ToString(
    hashEntryIdentities(storyFileHashes) + hashEntryIdentities(storybookFiles)
  );

  // Done after hashing so the graph used above is complete.
  pruneSyntheticFiles(files, hashes);

  return {
    files,
    storyFileHashes,
    unrecognizedStoryEntries,
    storybookFiles,
    storybookHash,
    attribution,
    outOfGraphFiles,
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
  const storyFiles: ManifestFile['storyFiles'] = Object.fromEntries(manifest.storyFileHashes);
  const storybookFiles: ManifestFile['storybookFiles'] = Object.fromEntries(
    manifest.storybookFiles
  );

  const files: ManifestFile['files'] = {};
  for (const [filePath, file] of manifest.files) {
    files[filePath] = {
      hash: file.hash,
      dependencies: [...file.dependencies],
    };
  }

  // Sorted so a manifest diff between two runs shows only real membership changes.
  const attribution = {
    storyReachable: [...manifest.attribution.storyReachable].sort(),
    previewSubtree: [...manifest.attribution.previewSubtree].sort(),
    storybookGlobals: [...manifest.attribution.storybookGlobals].sort(),
  };

  return {
    storybookHash: manifest.storybookHash,
    storybookFiles,
    // The per-file detail behind the out-of-graph roll-ups. Kept out of `files` and `attribution`,
    // which describe the bundle graph: the globals catch-all is defined by *absence* from
    // storyReachable/previewSubtree (storybookFiles.ts:76-79), which these files satisfy by
    // construction, so putting them in `files` would double-hash them into the catch-all.
    storybookConfigFiles: Object.fromEntries(manifest.outOfGraphFiles.storybookConfigFiles),
    staticFiles: Object.fromEntries(manifest.outOfGraphFiles.staticFiles),
    storyFiles,
    unrecognizedStoryEntries: manifest.unrecognizedStoryEntries,
    attribution,
    files,
  };
}

/**
 * Writes the entire manifest to a file in the output directory. This is uploaded to S3 for
 * debugging.
 *
 * @param manifest The manifest to write.
 * @param outputDirectory The directory to write the manifest file to.
 */
export function writeManifest(manifest: TurboSnapManifest, outputDirectory: string) {
  writeFileSync(
    path.join(outputDirectory, 'turbosnap-manifest.json'),
    JSON.stringify(serializeManifest(manifest))
  );
}

/**
 * Removes synthetic nodes that have no file on disk (require-context globs, externals) from the
 * manifest, including references to those removed nodes. This runs only after every derived hash
 * and attribution set has been computed from the complete graph, so pruning keeps those values
 * unchanged while limiting the serialized graph to real files.
 *
 * @param files The map of files to their hashes and dependencies, mutated in place.
 * @param hashes The content hashes keyed by canonical file path; a missing entry means no file.
 */
function pruneSyntheticFiles(files: Map<FilePath, TurboSnapFile>, hashes: Map<FilePath, FileHash>) {
  for (const file of files.values()) {
    for (const dependency of file.dependencies) {
      if (!hashes.has(dependency)) file.dependencies.delete(dependency);
    }
  }

  for (const filePath of files.keys()) {
    if (!hashes.has(filePath)) files.delete(filePath);
  }
}
