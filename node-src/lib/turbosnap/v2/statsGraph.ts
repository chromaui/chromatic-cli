import { AbsolutePath, Stats } from '../../../types';
import { FileHash, FilePath, SKIPPED_HASH, TurboSnapFile } from './graph';
import { ManifestInput } from './manifestInput';
import {
  canonicalFileNames,
  canonicalImporters,
  isNodeModulesPath,
  isSyntheticFile,
  moduleFileNames,
  normalizeStatsPath,
  resolveStatsPath,
  StatsRoots,
} from './paths';
import { ProjectFiles } from './projectFiles';
import { findSkippedFiles, SkipContext } from './skippedFiles';
import { CONFIG_ENTRY_FILES, detectStoryFiles } from './storyDetection';

/**
 * The part of {@link ManifestInput} reading the stats file needs: the two roots, the config directory
 * the skip rule reads, and the disk.
 */
export type StatsContext = Pick<
  ManifestInput,
  'projectRoot' | 'statsRoot' | 'configDir' | 'projectFiles'
>;

/**
 * What the builder's stats file says it emitted, read into one canonical graph. Builder spellings —
 * webpack, rspack and Vite each name the same file differently — stop mattering at this value; every
 * roll-up downstream sees canonical paths only.
 *
 * The graph is *unpruned*: synthetic nodes with no file on disk (require-context globs, externals,
 * virtual modules) are still members, because they are members of the subtrees the roll-ups walk.
 * {@link serializeManifest} filters them only when the manifest is written. Files v2 skips are
 * members too, hashed as {@link SKIPPED_HASH}, which is what tells them apart from synthetic nodes.
 */
export interface StatsGraph {
  /** Every module path, with its content hash and the paths it depends on. */
  files: Map<FilePath, TurboSnapFile>;
  /**
   * An entry for every on-disk file, keyed by canonical path: its content hash, or
   * {@link SKIPPED_HASH} when v2 skipped the file (see {@link findSkippedFiles}). A missing entry
   * means there is no file on disk.
   */
  hashes: Map<FilePath, FileHash>;
  /** The canonical paths of the on-disk files v2 skipped hashing. */
  skippedFiles: Set<FilePath>;
  /** The canonical paths the builder's entries identify as story files. */
  storyFiles: Set<FilePath>;
  /**
   * Known builder-generated modules that load preview annotations for every story. The paths are
   * canonical and include only roots present in this graph; see {@link detectGlobalRoots}.
   */
  globalRoots: Set<FilePath>;
}

// Vite uses virtual composition roots instead of `storybook-config-entry.js`. Storybook 8 and 9
// load annotations from `vite-app.js`; Storybook 10 loads them through `project-annotations.js`.
// Include both the raw virtual IDs and the resolved IDs that begin with `/virtual:`.
//
// Storybook 10.3.0 up to the release that includes storybookjs/storybook#36345 omits
// `project-annotations.js` and its edges from the stats. There, the globals fallback can still find
// a disconnected annotation, but not one that a story also imports; the graph contains no evidence
// that the file is global.
const VITE_COMPOSITION_ROOTS = new Set([
  '/virtual:/@storybook/builder-vite/vite-app.js',
  'virtual:@storybook/builder-vite/vite-app.js',
  '/virtual:/@storybook/builder-vite/project-annotations.js',
  'virtual:@storybook/builder-vite/project-annotations.js',
]);

/**
 * Reads a stats file into the graph the manifest rolls up: what each module is, what it depends on,
 * what it hashes to and which modules are story files.
 *
 * Locating files on disk happens here rather than in the caller because story detection depends on
 * it: telling a story file apart from a require-context glob is asking whether there is a real file
 * on disk. Hashing follows from the same lookup.
 *
 * @param stats The stats file to parse.
 * @param context The context the stats file was built in, which is needed to resolve module paths to
 * absolute files; see {@link StatsContext}.
 *
 * @returns The unpruned graph; see {@link StatsGraph}.
 */
export async function readStatsGraph(stats: Stats, context: StatsContext): Promise<StatsGraph> {
  const { projectRoot, statsRoot = projectRoot, projectFiles } = context;
  const roots = { projectRoot, statsRoot };
  const onDiskFiles = locateOnDiskFiles(stats, roots, projectFiles);
  const { hashes, skippedFiles } = await hashOnDiskFiles(onDiskFiles, context);

  // Story detection sees every file on disk, skipped or not: a generated story file is still a
  // story file, so its stories keep a hash that moves with the tracked files they import.
  const storyFiles = detectStoryFiles({ ...roots, onDiskFiles }, stats);

  const files = new Map<FilePath, TurboSnapFile>();
  for (const module of stats.modules) {
    // A module may bundle several real files (webpack/rspack module concatenation), so resolve its
    // canonical file paths, root first. Modules with no usable name (e.g. externals) are skipped.
    const fileNames = canonicalFileNames(module, roots);
    if (fileNames.length === 0) continue;
    const [sourceFilePath, ...concatenated] = fileNames;

    // Canonicalised so a dependency edge names the same key wherever the builder spells it.
    const importers = canonicalImporters(module, roots);

    linkConcatenatedFiles(files, sourceFilePath, concatenated, hashes);

    for (const importer of importers) {
      ensureFile(files, importer, hashes).dependencies.add(sourceFilePath);
    }
  }

  return { files, hashes, storyFiles, globalRoots: detectGlobalRoots(files, roots), skippedFiles };
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
    count += moduleFileNames(module).filter((name) => isNodeModulesPath(name)).length;
  }
  return count;
}

/**
 * Finds known builder-generated modules that load preview annotations for every story. Walking from
 * these roots identifies global files by reachability instead of by filename: an annotation can live
 * anywhere, and an unrelated story dependency can also be named `preview.ts`.
 *
 * Only known root names qualify. Other synthetic modules do not necessarily affect every story.
 *
 * @param files The unpruned canonical graph. Composition roots are usually synthetic and therefore
 * absent from the content hashes, but they are retained in this graph.
 * @param roots The filesystem roots used to resolve builder-specific module names; see
 * {@link StatsRoots}.
 *
 * @returns The canonical paths of the global composition roots present in the graph.
 */
function detectGlobalRoots(files: Map<FilePath, TurboSnapFile>, roots: StatsRoots): Set<FilePath> {
  // The config entry loads the preview annotations on webpack/rspack, so it is a global root here
  // as well as the locator of the story require-context in story detection. The Vite roots load
  // preview annotations only, so they stay out of story detection and the two sets are not merged.
  //
  // Normalize the known builder-specific names the same way as every other stats path before
  // comparing them with the graph's canonical keys.
  const known = [...CONFIG_ENTRY_FILES, ...VITE_COMPOSITION_ROOTS].map((name) =>
    normalizeStatsPath(name, roots.projectRoot, roots.statsRoot)
  );
  return new Set(known.filter((filePath) => files.has(filePath)));
}

/**
 * Records the internal edges of a concatenated module: webpack/rspack bundle several real files into
 * one module, so the other files become dependencies of the concatenation root. Each of them also gets
 * an entry of its own, so no dependency reference names a file the serialized graph omits.
 *
 * @param files The map of files to their hashes and dependencies, mutated in place.
 * @param rootPath The canonical path of the concatenation root.
 * @param concatenated The canonical paths of the other files bundled into the same module.
 * @param hashes The hash of every on-disk file, keyed by canonical path, or `SKIPPED_HASH` for a file v2 skipped.
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
 * @param hashes The hash of every on-disk file, keyed by canonical path, or `SKIPPED_HASH` for a file v2 skipped.
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
 * Synthetic modules (e.g. Vite's `virtual:` entries and inline `data:` URLs) have no on-disk
 * location. Skipping them is stats policy, which is why it is asked here rather than of the disk.
 * Beyond that, only a regular file is hashable, and what counts as one is the module's rule; see
 * {@link ProjectFiles.isFile}. Skipping a name with no file loses no evidence, because such a name is
 * never a source file and so can never be edited as one.
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
  if (isSyntheticFile(rawPath)) return undefined;
  const absolutePath = resolveStatsPath(rawPath, statsRoot);
  return projectFiles.isFile(absolutePath) ? absolutePath : undefined;
}

/**
 * Finds the file on disk behind every path the stats file names, keyed by canonical path.
 *
 * @param stats The stats file to parse.
 * @param roots The roots to anchor against; see {@link StatsRoots}.
 * @param projectFiles How to read the disk.
 *
 * @returns The absolute on-disk path of each hashable file, keyed by its canonical path.
 */
function locateOnDiskFiles(
  stats: Stats,
  roots: StatsRoots,
  projectFiles: ProjectFiles
): Map<FilePath, AbsolutePath> {
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

  const onDiskFiles = new Map<FilePath, AbsolutePath>();
  for (const rawPath of rawPaths) {
    const absolutePath = hashableAbsolutePath(rawPath, roots.statsRoot, projectFiles);
    if (absolutePath) {
      onDiskFiles.set(
        normalizeStatsPath(rawPath, roots.projectRoot, roots.statsRoot),
        absolutePath
      );
    }
  }
  return onDiskFiles;
}

/**
 * Hashes every on-disk file, keyed by canonical path. A file v2 skips gets {@link SKIPPED_HASH} in
 * place of a content hash, so the one invariant the graph relies on, an entry per on-disk file, is
 * established where the skip is decided rather than by every caller.
 *
 * @param onDiskFiles The absolute path of each on-disk file, keyed by canonical path.
 * @param context The config directory, and how to ask git and read the disk; see {@link SkipContext}.
 *
 * @returns The hash of every on-disk file, and the canonical paths of the skipped files.
 */
async function hashOnDiskFiles(
  onDiskFiles: Map<FilePath, AbsolutePath>,
  context: SkipContext
): Promise<{ hashes: Map<FilePath, FileHash>; skippedFiles: Set<FilePath> }> {
  const skipped = await findSkippedFiles([...onDiskFiles.values()], context);
  const fileHashes = await context.projectFiles.hashAll(
    [...onDiskFiles.values()].filter((absolutePath) => !skipped.has(absolutePath))
  );

  const hashes = new Map<FilePath, FileHash>();
  const skippedFiles = new Set<FilePath>();
  for (const [filePath, absolutePath] of onDiskFiles) {
    if (skipped.has(absolutePath)) {
      skippedFiles.add(filePath);
      hashes.set(filePath, SKIPPED_HASH);
    } else {
      hashes.set(filePath, fileHashes[absolutePath]);
    }
  }
  return { hashes, skippedFiles };
}
