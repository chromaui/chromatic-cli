import { existsSync, writeFileSync } from 'fs';
import path from 'path';
import xxHashWasm from 'xxhash-wasm';

import { Module, Stats } from '../../../types';
import { hashAbsolutePaths } from './fileHashes';
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
import { normalizeStatsPath, resolveStatsPath } from './paths';
import { collectStorybookFiles, FileAttribution } from './storybookFiles';
import { resolveStorybookVersion } from './storybookVersion';

// Generated entry points that import all story files. We use this to determine if a file is a story
// file because they may not always be *.stories.* files because it's configurable.
const STORIES_ENTRY_FILES = new Set([
  // v6 store (SB <= 6.3)
  './generated-stories-entry.js',
  // v6 store with .cjs extension (SB 6.5)
  './generated-stories-entry.cjs',
  // v7 store (SB >= 6.4)
  './storybook-stories.js',
  // vite builder
  '/virtual:/@storybook/builder-vite/storybook-stories.js',
  'virtual:@storybook/builder-vite/storybook-stories.js',
  // rspack builder
  './node_modules/.cache/storybook/default/dev-server/storybook-stories.js',
  './node_modules/.cache/storybook-rsbuild-builder/storybook-stories.js',
]);

// Config entry files import the story require-context (see collectStoryImporters). They import
// non-story files too (e.g. `.storybook/preview.ts`), so they only help locate the context — they
// are not treated as direct story importers.
const CONFIG_ENTRY_FILES = new Set([
  './storybook-config-entry.js',
  './node_modules/.cache/storybook-rsbuild-builder/storybook-config-entry.js',
  './node_modules/.cache/storybook/storybook-rsbuild-builder/storybook-config-entry.js',
]);

// Webpack/rspack name a module the bundle does not own `external "<request>"` (e.g. Storybook's
// preview runtime globals). It has no on-disk file and imports nothing.
const EXTERNAL_MODULE = /^external "/;

// The synthetic `storybookFiles` key holding the installed Storybook version. Unlike every other
// entry this is a version string rather than a hash, because the preview core runtime is served
// outside the module graph on webpack and rspack; see resolveStorybookVersion.
export const STORYBOOK_VERSION_KEY = '<storybookVersion>';

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
  /**
   * One entry per `.storybook/preview.*` holding its rolled-up hash, plus the
   * {@link STORYBOOK_GLOBALS_KEY} catch-all, the {@link STORYBOOK_VERSION_KEY} version string and the
   * `<storybookConfig>` / `<staticFiles>` out-of-graph roll-ups (see {@link rollUpOutOfGraphFiles}). A
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
  storyFiles: Record<FilePath, FileHash>;
  storybookFiles: Record<FilePath, FileHash | StorybookVersion>;
  files: Record<FilePath, { hash: FileHash; dependencies: FilePath[] }>;
  attribution: Record<keyof FileAttribution, FilePath[]>;
  storybookConfigFiles: Record<FilePath, FileHash>;
  staticFiles: Record<FilePath, FileHash>;
}

/**
 * Parses the stats file and hashes the files into a TurboSnap manifest.
 *
 * @param stats The stats file to parse.
 * @param projectRoot The absolute Storybook project root that module paths anchor against.
 * @param outOfGraph Where to find the Storybook inputs that are never bundler inputs; see
 * {@link OutOfGraphInput}.
 *
 * @returns The manifest containing the file hashes, story file hashes, Storybook config file hashes,
 * and Storybook hash.
 */
export async function buildManifest(
  stats: Stats,
  projectRoot: string,
  outOfGraph: OutOfGraphInput
): Promise<TurboSnapManifest> {
  const hashes = await hashFiles(stats, projectRoot);
  const files = new Map<FilePath, TurboSnapFile>();
  // A temporary set to collect the story file names before we build the story file hashes because
  // we need to parse the entire list of dependencies first.
  const storyFileNames = new Set<FilePath>();

  const storyImporters = collectStoryImporters(stats, projectRoot, hashes);

  for (const module of stats.modules) {
    // A module may bundle several real files (webpack/rspack module concatenation), so resolve its
    // canonical file paths, root first. Modules with no usable name (e.g. externals) are skipped.
    const fileNames = moduleFileNames(module).map((name) => normalizeStatsPath(name, projectRoot));
    if (fileNames.length === 0) continue;
    const [sourceFilePath, ...concatenated] = fileNames;

    // Importers hold the builder's own entry paths (e.g. `./storybook-stories.js`), canonicalised so
    // they compare against the canonical keys collectStoryImporters returns — the builder may spell
    // the same entry with or without a `./` prefix. Entry reasons carry a null moduleName, so drop
    // those.
    const importers = (module.reasons ?? [])
      .map((reason) => reason.moduleName)
      .filter(Boolean)
      .map((name) => normalizeStatsPath(name, projectRoot));

    // Only real files are story files; requiring a hash excludes the require-context glob itself
    // (which is imported by an entry but has no on-disk file).
    if (hashes.has(sourceFilePath) && importers.some((importer) => storyImporters.has(importer))) {
      storyFileNames.add(sourceFilePath);
    }

    linkConcatenatedFiles(files, sourceFilePath, concatenated, hashes);

    for (const importer of importers) {
      ensureFile(files, importer, hashes).dependencies.add(sourceFilePath);
    }
  }

  const { h64ToString } = await xxHashWasm();
  const storyFileHashes = new Map<FilePath, FileHash>();
  for (const storyFile of storyFileNames) {
    const subtree = collectTransitiveDependencies(files, storyFile);
    storyFileHashes.set(storyFile, rollUpFileHashes(hashes, subtree, h64ToString));
  }

  const { storybookFiles, attribution } = collectStorybookFiles(
    files,
    hashes,
    storyFileNames,
    h64ToString
  );

  // The preview core runtime is out of the module graph on webpack and rspack, so no file hash can
  // see a Storybook upgrade there. Track the version instead; it is a plain string, not a hash.
  storybookFiles.set(STORYBOOK_VERSION_KEY, resolveStorybookVersion(projectRoot));

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

  return { files, storyFileHashes, storybookFiles, storybookHash, attribution, outOfGraphFiles };
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
    storyFiles,
    storybookFiles,
    files,
    attribution,
    // The per-file detail behind the out-of-graph roll-ups. Kept out of `files` and `attribution`,
    // which describe the bundle graph: the globals catch-all is defined by *absence* from
    // storyReachable/previewSubtree (storybookFiles.ts:76-79), which these files satisfy by
    // construction, so putting them in `files` would double-hash them into the catch-all.
    storybookConfigFiles: Object.fromEntries(manifest.outOfGraphFiles.storybookConfigFiles),
    staticFiles: Object.fromEntries(manifest.outOfGraphFiles.staticFiles),
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
 * Returns the real source files a stats module represents, root first. Webpack/rspack concatenate
 * modules and expose the combined files in `module.modules`; a plain module has just its own name.
 * Names that are null/undefined (e.g. externals or entries) are dropped.
 *
 * Deliberately not shared with `statsPaths` in statsAnchor.ts, which enumerates the same stats for a
 * different question. This returns each file *once*, preferring `nameForCondition`, because a second
 * spelling of the same module would become a duplicate graph node; `statsPaths` takes every spelling
 * because it is gathering evidence and only asks whether any one of them witnesses a mismatch.
 *
 * @param module The stats module to read file names from.
 *
 * @returns The module's real file names, or an empty array if it has none.
 */
function moduleFileNames(module: Module): string[] {
  // rspack puts the real file name in `nameForCondition` then fallback to `name` for the other builders.
  const names = module.modules?.length
    ? module.modules.map((m) => m.nameForCondition ?? m.name)
    : [module.nameForCondition ?? module.name];
  return names.filter(Boolean);
}

/**
 * Counts the graph's `node_modules` file names. Read off the stats file rather than the manifest,
 * because it is a property of the builder's output rather than of what we derived from it.
 *
 * @param stats The stats file to parse.
 *
 * @returns The number of `node_modules` file names across all modules.
 */
export function countNodeModulesFiles(stats: Stats): number {
  let count = 0;
  for (const module of stats.modules) {
    count += moduleFileNames(module).filter((name) => name.includes('node_modules')).length;
  }
  return count;
}

/**
 * Collects the module names a story file may be imported from. Vite imports stories straight from
 * the builder entry, but webpack/rspack wrap them in a lazy require-context: an entry (the stories
 * entry or the config entry) imports the context and the context imports the stories. Treat any
 * such context (a module imported by an entry file that isn't itself a real file) as a story
 * importer too, so both builders are covered.
 *
 * @param stats The stats file to parse.
 * @param projectRoot The absolute Storybook project root that module paths anchor against.
 * @param hashes The content hashes keyed by canonical file path, used to tell real files apart
 * from the require-context glob.
 *
 * @returns The set of canonical importer keys that indicate a story file.
 */
function collectStoryImporters(
  stats: Stats,
  projectRoot: string,
  hashes: Map<FilePath, FileHash>
): Set<string> {
  const canonical = (name: string) => normalizeStatsPath(name, projectRoot);
  // The stories entry directly imports stories (Vite), so it is a story importer on its own. The
  // config entry only helps locate the require-context, so it is not. Both are canonicalised because
  // a builder may spell its own entry either way: rsbuild names the same module both
  // `storybook-stories.js` and `./storybook-stories.js`, and the raw spelling never matched.
  const entryFiles = new Set(
    [...STORIES_ENTRY_FILES, ...CONFIG_ENTRY_FILES].map((name) => canonical(name))
  );
  const storyImporters = new Set([...STORIES_ENTRY_FILES].map((name) => canonical(name)));
  for (const module of stats.modules) {
    const [root] = moduleFileNames(module).map((name) => canonical(name));
    if (!module.name || !root || hashes.has(root)) continue;
    // An external is a graph leaf, so it can never import a story. It has no on-disk file either,
    // which would otherwise let it through as a require-context.
    if (EXTERNAL_MODULE.test(module.name)) continue;
    const importedByEntry = (module.reasons ?? []).some(
      (reason) => reason.moduleName && entryFiles.has(canonical(reason.moduleName))
    );
    if (importedByEntry) storyImporters.add(canonical(module.name));
  }
  return storyImporters;
}

/**
 * Records the internal edges of a concatenated module: webpack/rspack bundle several real files into
 * one module, so the other files become dependencies of the concatenation root. Each of them also gets
 * an entry of its own, so no dependency reference names a file the serialized graph omits.
 *
 * @param files The map of files to their hashes and dependencies, mutated in place.
 * @param rootPath The canonical path of the concatenation root.
 * @param concatenated The canonical paths of the other files bundled into the same module.
 * @param hashes The content hashes keyed by canonical file path.
 */
function linkConcatenatedFiles(
  files: Map<FilePath, TurboSnapFile>,
  rootPath: FilePath,
  concatenated: FilePath[],
  hashes: Map<FilePath, FileHash>
) {
  const rootFile = ensureFile(files, rootPath, hashes);
  for (const dependency of concatenated) {
    rootFile.dependencies.add(dependency);
    ensureFile(files, dependency, hashes);
  }
}

/**
 * Gets the manifest entry for a file, creating it (seeded with the file's content hash) if absent.
 *
 * @param files The map of files to their hashes and dependencies.
 * @param filePath The file to get or create an entry for.
 * @param hashes The content hashes keyed by canonical file path.
 *
 * @returns The file's manifest entry.
 */
function ensureFile(
  files: Map<FilePath, TurboSnapFile>,
  filePath: FilePath,
  hashes: Map<FilePath, FileHash>
): TurboSnapFile {
  let file = files.get(filePath);
  if (!file) {
    file = { hash: hashes.get(filePath) ?? '', dependencies: new Set() };
    files.set(filePath, file);
  }
  return file;
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

async function hashFiles(stats: Stats, projectRoot: string): Promise<Map<FilePath, FileHash>> {
  // Collect every referenced module path once, expanding concatenated modules into their real
  // files and skipping importers with a null moduleName.
  const rawPaths = new Set<FilePath>();
  for (const module of stats.modules) {
    for (const name of moduleFileNames(module)) {
      rawPaths.add(name);
    }
    for (const reason of module.reasons ?? []) {
      if (reason.moduleName) rawPaths.add(reason.moduleName);
    }
  }

  // Map each hashable file's canonical project-relative name to its absolute on-disk path. Virtual
  // modules (e.g. Vite's `virtual:` entries) don't exist on disk and can't be hashed or traced.
  const normalizedToAbsolute = new Map<FilePath, string>();
  for (const rawPath of rawPaths) {
    if (rawPath.includes('virtual:')) continue;
    const absolutePath = resolveStatsPath(rawPath, projectRoot);
    if (!existsSync(absolutePath)) continue;
    normalizedToAbsolute.set(normalizeStatsPath(rawPath, projectRoot), absolutePath);
  }

  const fileHashes = await hashAbsolutePaths([...normalizedToAbsolute.values()]);

  const hashes = new Map<FilePath, FileHash>();
  for (const [normalizedName, absolutePath] of normalizedToAbsolute) {
    hashes.set(normalizedName, fileHashes[absolutePath]);
  }

  return hashes;
}
