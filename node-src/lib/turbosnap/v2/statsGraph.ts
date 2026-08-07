import { Stats } from '../../../types';
import { FileHash, FilePath, TurboSnapFile } from './graph';
import { moduleFileNames, normalizeStatsPath, resolveStatsPath } from './paths';
import { ProjectFiles } from './projectFiles';
import { detectStoryFiles } from './storyDetection';

/**
 * What the builder's stats file says it emitted, read into one canonical graph. Builder spellings —
 * webpack, rspack and Vite each name the same file differently — stop mattering at this value; every
 * roll-up downstream sees canonical paths only.
 *
 * The graph is *unpruned*: synthetic nodes with no file on disk (require-context globs, externals,
 * virtual modules) are still members, because they are members of the subtrees the roll-ups walk.
 * See `pruneSyntheticFiles` in ./manifest.
 */
export interface StatsGraph {
  /** Every module path, with its content hash and the paths it depends on. */
  files: Map<FilePath, TurboSnapFile>;
  /** Content hashes keyed by canonical path; a missing entry means there is no file on disk. */
  hashes: Map<FilePath, FileHash>;
  /** The canonical paths the builder's entries identify as story files. */
  storyFiles: Set<FilePath>;
  /** Generated entries above a lazy context that are absent from the explicit entry catalogue. */
  unrecognizedStoryEntries: FilePath[];
}

/**
 * Reads a stats file into the graph the manifest rolls up: what each module is, what it depends on,
 * what it hashes to and which modules are story files.
 *
 * Hashing happens here rather than in the caller because story detection depends on it: telling a
 * story file apart from a require-context glob is asking whether there is a real file on disk, which
 * is what the hashes answer.
 *
 * @param stats The stats file to parse.
 * @param context.projectRoot The absolute Storybook project root that module paths anchor against.
 * @param context.statsRoot The absolute directory relative stats paths are named from.
 * @param context.projectFiles How to read the disk.
 *
 * @returns The unpruned graph; see {@link StatsGraph}.
 */
export async function readStatsGraph(
  stats: Stats,
  context: { projectRoot: string; statsRoot: string; projectFiles: ProjectFiles }
): Promise<StatsGraph> {
  const { projectRoot, statsRoot, projectFiles } = context;
  const hashes = await hashFiles(stats, projectRoot, statsRoot, projectFiles);

  const { storyFiles, unrecognizedStoryEntries } = detectStoryFiles(stats, {
    projectRoot,
    statsRoot,
    realFiles: hashes,
  });

  const files = new Map<FilePath, TurboSnapFile>();
  for (const module of stats.modules) {
    // A module may bundle several real files (webpack/rspack module concatenation), so resolve its
    // canonical file paths, root first. Modules with no usable name (e.g. externals) are skipped.
    const fileNames = moduleFileNames(module).map((name) =>
      normalizeStatsPath(name, projectRoot, statsRoot)
    );
    if (fileNames.length === 0) continue;
    const [sourceFilePath, ...concatenated] = fileNames;

    // Canonicalised so a dependency edge names the same key wherever the builder spells it. Entry
    // reasons carry a null moduleName, so drop those.
    const importers = (module.reasons ?? [])
      .map((reason) => reason.moduleName)
      .filter(Boolean)
      .map((name) => normalizeStatsPath(name, projectRoot, statsRoot));

    linkConcatenatedFiles(files, sourceFilePath, concatenated, hashes);

    for (const importer of importers) {
      ensureFile(files, importer, hashes).dependencies.add(sourceFilePath);
    }
  }

  return { files, hashes, storyFiles, unrecognizedStoryEntries };
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
 * Gets the graph entry for a file, creating it (seeded with the file's content hash) if absent.
 *
 * @param files The map of files to their hashes and dependencies.
 * @param filePath The file to get or create an entry for.
 * @param hashes The content hashes keyed by canonical file path.
 *
 * @returns The file's graph entry.
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
 * Resolves a stats module path to the absolute on-disk file to hash, or undefined when there is
 * nothing hashable there.
 *
 * Virtual modules (e.g. Vite's `virtual:` entries) have no on-disk location. Skipping them is stats
 * policy, which is why it is asked here rather than of the disk. Beyond that, only a regular file is
 * hashable, and what counts as one is the module's rule; see {@link ProjectFiles.isFile}. Skipping a
 * name with no file loses no evidence, because such a name is never a source file and so can never be
 * edited as one.
 *
 * @param rawPath The module name from the stats file.
 * @param statsRoot The directory relative stats paths are named from.
 * @param projectFiles How to read the disk.
 *
 * @returns The absolute path to hash, or undefined if there is no hashable file.
 */
function hashableAbsolutePath(
  rawPath: FilePath,
  statsRoot: string,
  projectFiles: ProjectFiles
): string | undefined {
  if (rawPath.includes('virtual:')) return undefined;
  const absolutePath = resolveStatsPath(rawPath, statsRoot);
  return projectFiles.isFile(absolutePath) ? absolutePath : undefined;
}

async function hashFiles(
  stats: Stats,
  projectRoot: string,
  statsRoot: string,
  projectFiles: ProjectFiles
): Promise<Map<FilePath, FileHash>> {
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

  // Map each hashable file's canonical project-relative name to its absolute on-disk path.
  const normalizedToAbsolute = new Map<FilePath, string>();
  for (const rawPath of rawPaths) {
    const absolutePath = hashableAbsolutePath(rawPath, statsRoot, projectFiles);
    if (absolutePath) {
      normalizedToAbsolute.set(normalizeStatsPath(rawPath, projectRoot, statsRoot), absolutePath);
    }
  }

  const fileHashes = await projectFiles.hashAll([...normalizedToAbsolute.values()]);

  const hashes = new Map<FilePath, FileHash>();
  for (const [normalizedName, absolutePath] of normalizedToAbsolute) {
    hashes.set(normalizedName, fileHashes[absolutePath]);
  }

  return hashes;
}
