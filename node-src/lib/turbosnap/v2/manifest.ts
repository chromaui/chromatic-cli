import { existsSync, writeFileSync } from 'fs';
import path from 'path';
import xxHashWasm from 'xxhash-wasm';

import { getFileHashes } from '../../../lib/getFileHashes';
import { Module, Stats } from '../../../types';
import { normalizeStatsPath, resolveStatsPath } from './paths';

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

type FilePath = string;
type FileHash = string;

interface TurboSnapFile {
  hash: FileHash;
  dependencies: Set<FilePath>;
}

/**
 * The TurboSnap manifest holds the hash of every file in the Storybook project and the dependencies
 * of each file, along with the derived per-story and whole-Storybook hashes. This is uploaded as a
 * static file to S3 for debugging purposes.
 */
export interface TurboSnapManifest {
  files: Map<FilePath, TurboSnapFile>;
  storyFileHashes: Map<FilePath, FileHash>;
  storybookHash: string;
}

/**
 * The manifest shape written to disk: the whole-Storybook hash, the per-story hashes, and the hash
 * and dependencies of every source file.
 *
 * Note: This is a separate type than TurboSnapManifest because we're writing to a file and need to
 * use JSON-safe types like arrays and objects instead of sets and maps.
 */
interface ManifestFile {
  storybookHash: string;
  storyFiles: Record<FilePath, FileHash>;
  files: Record<FilePath, { hash: FileHash; dependencies: FilePath[] }>;
}

/**
 * Parses the stats file and hashes the files into a TurboSnap manifest.
 *
 * @param stats The stats file to parse.
 * @param projectRoot The absolute Storybook project root to anchor module paths against.
 *
 * @returns The manifest containing the file hashes, story file hashes, and Storybook hash.
 */
export async function buildManifest(stats: Stats, projectRoot: string): Promise<TurboSnapManifest> {
  const hashes = await hashFiles(stats, projectRoot);
  const files = new Map<FilePath, TurboSnapFile>();
  // A temporary set to collect the story file names before we build the story file hashes because
  // we need to parse the entire list of dependencies first.
  const storyFileNames = new Set<FilePath>();

  for (const module of stats.modules) {
    // A module may bundle several real files (webpack/rspack module concatenation), so resolve its
    // canonical file paths, root first. Modules with no usable name (e.g. externals) are skipped.
    const fileNames = moduleFileNames(module).map((name) => normalizeStatsPath(name, projectRoot));
    if (fileNames.length === 0) continue;
    const [sourceFilePath, ...concatenated] = fileNames;

    // Match story entry files against the raw importer names, since STORIES_ENTRY_FILES holds the
    // builder's own entry paths (e.g. `./storybook-stories.js`). Entry reasons carry a null
    // moduleName, so drop those.
    const rawImporters = (module.reasons ?? [])
      .map((reason) => reason.moduleName)
      .filter((moduleName): moduleName is string => Boolean(moduleName));

    if (rawImporters.some((importer) => STORIES_ENTRY_FILES.has(importer))) {
      storyFileNames.add(sourceFilePath);
    }

    // The other files in a concatenated module are dependencies of the root file. Webpack hides
    // these internal edges inside a single module, so reconstruct them here.
    const rootFile = ensureFile(files, sourceFilePath, hashes);
    for (const dependency of concatenated) {
      rootFile.dependencies.add(dependency);
    }

    for (const rawImporter of rawImporters) {
      const importer = normalizeStatsPath(rawImporter, projectRoot);
      ensureFile(files, importer, hashes).dependencies.add(sourceFilePath);
    }
  }

  const { h64ToString } = await xxHashWasm();
  const storyFileHashes = new Map<FilePath, FileHash>();
  for (const storyFile of storyFileNames) {
    // Combine dependency content-hashes in sorted-hash order so the result depends only on the set
    // of contents, not on where the files live. Reading from `hashes` (not `files`) also includes
    // leaf dependencies. Together this keeps a story's hash stable when the project or a dependency
    // moves within the repository.
    const combined = [...collectTransitiveDependencies(files, storyFile)]
      .map((filePath) => hashes.get(filePath) ?? '')
      .sort()
      .join('');
    storyFileHashes.set(storyFile, h64ToString(combined));
  }

  // Sort the story hashes so the Storybook hash is independent of module iteration order.
  const storybookHash = h64ToString([...storyFileHashes.values()].sort().join(''));

  return { files, storyFileHashes, storybookHash };
}

/**
 * Writes the entire manifest to a file in the output directory. This is uploaded to S3 for
 * debugging.
 *
 * @param manifest The manifest to write.
 * @param outputDirectory The directory to write the manifest file to.
 */
export function writeManifest(manifest: TurboSnapManifest, outputDirectory: string) {
  const storyFiles: ManifestFile['storyFiles'] = Object.fromEntries(manifest.storyFileHashes);

  const files: ManifestFile['files'] = {};
  for (const [filePath, file] of manifest.files) {
    files[filePath] = {
      hash: file.hash,
      dependencies: [...file.dependencies],
    };
  }

  const manifestFile: ManifestFile = {
    storybookHash: manifest.storybookHash,
    storyFiles,
    files,
  };

  writeFileSync(
    path.join(outputDirectory, 'turbosnap-manifest.json'),
    JSON.stringify(manifestFile)
  );
}

/**
 * Walks the dependency graph from a file, collecting it and every file it transitively depends
 * on.
 *
 * @param files The map of files to their hashes and dependencies.
 * @param filePath The file to collect the transitive dependencies of.
 * @param dependencies The set of dependencies to add to.
 *
 * @returns A set of all the files that the given file transitively depends on.
 */
function collectTransitiveDependencies(
  files: Map<FilePath, TurboSnapFile>,
  filePath: string,
  dependencies = new Set<string>()
) {
  if (dependencies.has(filePath)) {
    return dependencies;
  }

  dependencies.add(filePath);
  for (const dependency of files.get(filePath)?.dependencies ?? []) {
    collectTransitiveDependencies(files, dependency, dependencies);
  }

  return dependencies;
}

/**
 * Returns the real source files a stats module represents, root first. Webpack/rspack concatenate
 * modules and expose the combined files in `module.modules`; a plain module has just its own name.
 * Names that are null/undefined (e.g. externals or entries) are dropped.
 *
 * @param module The stats module to read file names from.
 *
 * @returns The module's real file names, or an empty array if it has none.
 */
function moduleFileNames(module: Module): string[] {
  const names = module.modules?.length ? module.modules.map((m) => m.name) : [module.name];
  return names.filter((name): name is string => Boolean(name));
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

  // getFileHashes joins its directory argument with each file; pass '' so the absolute paths are
  // used as-is, and it returns hashes keyed by those absolute paths.
  const absolutePaths = [...normalizedToAbsolute.values()];
  const fileHashes = await getFileHashes(absolutePaths, '', 10);

  const hashes = new Map<FilePath, FileHash>();
  for (const [normalizedName, absolutePath] of normalizedToAbsolute) {
    hashes.set(normalizedName, fileHashes[absolutePath]);
  }

  return hashes;
}
