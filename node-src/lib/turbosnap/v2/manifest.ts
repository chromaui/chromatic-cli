import { existsSync, writeFileSync } from 'fs';
import path from 'path';
import xxHashWasm from 'xxhash-wasm';

import { getFileHashes } from '../../../lib/getFileHashes';
import { Stats } from '../../../types';

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
 *
 * @returns The manifest containing the file hashes, story file hashes, and Storybook hash.
 */
export async function buildManifest(stats: Stats): Promise<TurboSnapManifest> {
  const hashes = await hashFiles(stats);
  const files = new Map<FilePath, TurboSnapFile>();
  // A temporary set to collect the story file names before we build the story file hashes because
  // we need to parse the entire list of dependencies first.
  const storyFileNames = new Set<FilePath>();

  // This is a second loop is all in-memory so it's not a wild performance hit. We're doing this
  // so it's easier to read and understand.
  for (const module of stats.modules) {
    const sourceFilePath = module.name;
    const importers = module.reasons?.map((reason) => reason.moduleName) ?? [];

    if (importers.some((importer) => STORIES_ENTRY_FILES.has(importer))) {
      storyFileNames.add(sourceFilePath);
    }

    for (const importer of importers) {
      const file = files.get(importer);
      if (file) {
        file.dependencies.add(sourceFilePath);
      } else {
        files.set(importer, {
          hash: hashes.get(importer) ?? '',
          dependencies: new Set([sourceFilePath]),
        });
      }
    }
  }

  const { h64ToString } = await xxHashWasm();
  const storyFileHashes = new Map<FilePath, FileHash>();
  for (const storyFile of storyFileNames) {
    const dependencyPaths = [...collectTransitiveDependencies(files, storyFile)].sort();
    const combined = dependencyPaths.map((filePath) => files.get(filePath)?.hash).join('');
    storyFileHashes.set(storyFile, h64ToString(combined));
  }

  const storybookHash = h64ToString([...storyFileHashes.values()].join(''));

  return { files, storyFileHashes, storybookHash };
}

/**
 * Sends the story file and Storybook hashes to the Index and gets back the list of changed files.
 *
 * @param _manifest The manifest whose story file and Storybook hashes are sent to the Index.
 *
 * @returns The changed files.
 */
// TODO: Implement this!
export async function determineChangedFiles(_manifest: TurboSnapManifest) {
  // Send the story file and Storybook hashes to the Index and get back a list of changed files.
  return {};
}

/**
 * Writes the entire manifest to a file in the output directory. This is uploaded to S3 for
 * debugging.
 *
 * @param manifest The manifest to write.
 * @param outputDirectory The directory to write the manifest file to.
 */
export function writeManifest(manifest: TurboSnapManifest, outputDirectory: string) {
  const storyFiles: ManifestFile['storyFiles'] = {};
  for (const [filePath, hash] of manifest.storyFileHashes) {
    storyFiles[normalizePath(filePath)] = hash;
  }

  const files: ManifestFile['files'] = {};
  for (const [filePath, file] of manifest.files) {
    files[normalizePath(filePath)] = {
      hash: file.hash,
      dependencies: [...file.dependencies].map((dependency) => normalizePath(dependency)),
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
 * @param filePath The module name from the stats file (e.g. `./src/file.ts`).
 *
 * @returns The path relative to the project root (e.g. `src/file.ts`).
 */
function normalizePath(filePath: string) {
  return filePath.replace(/^\.\//, '');
}

/**
 * @param filePath The module name from the stats file.
 *
 * @returns True if the file exists on disk and can be hashed.
 */
function isHashable(filePath: string) {
  return !filePath.includes('virtual:') && existsSync(path.join(process.cwd(), filePath));
}

async function hashFiles(stats: Stats): Promise<Map<FilePath, FileHash>> {
  // Hash every real file in one batch before wiring up dependencies. Virtual modules (e.g. Vite's
  // `/virtual:` entries) don't exist on disk and can't be hashed or traced.
  const allPaths = new Set<FilePath>();
  for (const module of stats.modules) {
    allPaths.add(module.name);
    for (const reason of module.reasons ?? []) {
      allPaths.add(reason.moduleName);
    }
  }

  const filesToHash = [...allPaths].filter((filePath) => isHashable(filePath));

  const hashes = new Map<FilePath, FileHash>();
  const fileHashes = await getFileHashes(filesToHash, process.cwd(), 10);

  for (const file of filesToHash) {
    hashes.set(file, fileHashes[file]);
  }

  return hashes;
}
