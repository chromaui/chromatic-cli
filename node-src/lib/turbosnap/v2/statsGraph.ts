import { AbsolutePath, Stats } from '../../../types';
import {
  collectTransitiveDependencies,
  FileHash,
  FilePath,
  SKIPPED_HASH,
  TurboSnapFile,
} from './graph';
import { ManifestInput } from './manifestInput';
import {
  canonicalFileNames,
  canonicalImportEdges,
  indexModuleSources,
  isNodeModulesPath,
  isSyntheticFile,
  moduleFileNames,
  ModuleSources,
  normalizeStatsPath,
  reasonImporter,
  resolveStatsPath,
  rootFilePath,
  StatsRoots,
} from './paths';
import { ProjectFiles } from './projectFiles';
import { partitionSkipped, SkipReason, SkipRule } from './skippedFiles';
import { CONFIG_ENTRY_FILES, detectStoryFiles } from './storyDetection';

/** The part of {@link ManifestInput} reading the stats file needs: the two roots and the disk. */
export type StatsContext = Pick<ManifestInput, 'projectRoot' | 'statsRoot' | 'projectFiles'>;

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
   * {@link SKIPPED_HASH} when v2 skipped the file (see {@link buildSkipRule}). A missing entry
   * means there is no file on disk.
   */
  hashes: Map<FilePath, FileHash>;
  /** The on-disk files v2 skipped hashing, keyed by canonical path, each with its reason. */
  skippedFiles: Map<FilePath, SkipReason>;
  /**
   * The untraced files and every path they imported, directly or through further imports, before
   * their edges were severed. A file reached only this way is untraced by inheritance: it is in no
   * story's subtree, and the globals fallback must not adopt it either, or an edit behind the wall
   * would recapture every story instead of none; see `collectStorybookFiles`.
   */
  untracedSubtrees: Set<FilePath>;
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
 * @param skipRule Which on-disk files to leave unhashed; see {@link buildSkipRule}.
 *
 * @returns The unpruned graph; see {@link StatsGraph}.
 */
export async function readStatsGraph(
  stats: Stats,
  context: StatsContext,
  skipRule: SkipRule
): Promise<StatsGraph> {
  const { projectRoot, statsRoot = projectRoot, projectFiles } = context;
  const roots = { projectRoot, statsRoot };
  const moduleSources = indexModuleSources(stats);
  const onDiskFiles = locateOnDiskFiles(stats, roots, moduleSources, projectFiles);
  const { hashes, skippedFiles } = await hashOnDiskFiles(onDiskFiles, skipRule, projectFiles);

  // Story detection sees every file on disk, skipped or not: a generated story file is still a
  // story file, so its stories keep a hash that moves with the tracked files they import.
  const storyFiles = detectStoryFiles({ ...roots, onDiskFiles, moduleSources }, stats);

  const reasonedFiles = filesWithReasons(stats, roots);
  const files = new Map<FilePath, TurboSnapFile>();
  for (const module of stats.modules) {
    // A module may bundle several real files (webpack/rspack module concatenation), so resolve its
    // canonical file paths, root first. Modules with no usable name (e.g. externals) are skipped.
    const fileNames = canonicalFileNames(module, roots);
    if (fileNames.length === 0) continue;
    const [sourceFilePath, ...concatenated] = fileNames;

    linkConcatenatedFiles(files, sourceFilePath, concatenated, reasonedFiles, hashes);

    for (const { importer, groupRoot } of canonicalImportEdges(module, roots, moduleSources)) {
      ensureFile(files, importer, hashes).dependencies.add(sourceFilePath);
      // A reason blaming a group while resolving to a member is also evidence the group contains
      // that member, which the stats may list nowhere else.
      if (groupRoot) {
        linkConcatenatedFiles(files, groupRoot, [importer], reasonedFiles, hashes);
      }
    }
  }

  const untracedSubtrees = wallOffUntracedFiles(files, skippedFiles);

  return {
    files,
    hashes,
    storyFiles,
    globalRoots: detectGlobalRoots(files, roots),
    skippedFiles,
    untracedSubtrees,
  };
}

/**
 * Severs the dependency edges of every untraced file, making it the wall v1 makes it: v1 stops its
 * trace at an untraced importer, which is what the documented recipes rely on, untracing a barrel to
 * untrace what it re-exports and untracing a global decorator to untrace the utilities it imports.
 * The node itself stays, so an untraced story file is still a story file and an importer's edge to
 * it is still recorded. A gitignored file keeps its edges; see {@link SkipReason}.
 *
 * @param files The graph, mutated in place.
 * @param skippedFiles The skipped files with their reasons, keyed by canonical path.
 *
 * @returns The untraced files and everything the severed edges led to; see
 * {@link StatsGraph.untracedSubtrees}.
 */
function wallOffUntracedFiles(
  files: Map<FilePath, TurboSnapFile>,
  skippedFiles: Map<FilePath, SkipReason>
): Set<FilePath> {
  const untracedFiles = [...skippedFiles]
    .filter(([, reason]) => reason === 'untraced')
    .map(([filePath]) => filePath);

  const subtrees = new Set<FilePath>();
  for (const filePath of untracedFiles) {
    collectTransitiveDependencies(files, filePath, subtrees);
  }
  for (const filePath of untracedFiles) {
    files.get(filePath)?.dependencies.clear();
  }
  return subtrees;
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
 * The canonical root paths of the stats modules that carry reasons of their own. A concatenated
 * member listed here gets its import edges from those reasons; see {@link linkConcatenatedFiles}.
 *
 * @param stats The stats file to parse.
 * @param roots The roots to anchor against; see {@link StatsRoots}.
 *
 * @returns The canonical paths of the modules with reasons.
 */
function filesWithReasons(stats: Stats, roots: StatsRoots): Set<FilePath> {
  const reasoned = new Set<FilePath>();
  for (const module of stats.modules) {
    const filePath = module.reasons?.length ? rootFilePath(module, roots) : undefined;
    if (filePath) reasoned.add(filePath);
  }
  return reasoned;
}

/**
 * Records the internal edges of a concatenated module: webpack/rspack bundle several real files into
 * one module. Each of them gets an entry of its own, so no dependency reference names a file the
 * serialized graph omits.
 *
 * A member with reasons of its own takes its edges from them, which name the member that imports
 * it. Linking it to the root as well would let the root reach it past an untraced member in
 * between. Only a member the stats give no reasons for falls back to being a dependency of the
 * root.
 *
 * @param files The map of files to their hashes and dependencies, mutated in place.
 * @param rootPath The canonical path of the concatenation root.
 * @param concatenated The canonical paths of the other files bundled into the same module.
 * @param reasonedFiles The canonical paths of the modules with reasons; see {@link filesWithReasons}.
 * @param hashes The hash of every on-disk file, keyed by canonical path, or `SKIPPED_HASH` for a file v2 skipped.
 */
function linkConcatenatedFiles(
  files: Map<FilePath, TurboSnapFile>,
  rootPath: FilePath,
  concatenated: FilePath[],
  reasonedFiles: Set<FilePath>,
  hashes: Map<FilePath, FileHash>
) {
  const rootFile = ensureFile(files, rootPath, hashes);
  for (const member of concatenated) {
    if (!reasonedFiles.has(member)) rootFile.dependencies.add(member);
    ensureFile(files, member, hashes);
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
 * @param moduleSources The source files of the stats module identifiers; see
 * {@link indexModuleSources}.
 * @param projectFiles How to read the disk.
 *
 * @returns The absolute on-disk path of each hashable file, keyed by its canonical path.
 */
function locateOnDiskFiles(
  stats: Stats,
  roots: StatsRoots,
  moduleSources: ModuleSources,
  projectFiles: ProjectFiles
): Map<FilePath, AbsolutePath> {
  // Collect every referenced module path once, expanding concatenated modules into their real
  // files and skipping reasons with no importer name (entry reasons).
  const rawPaths = new Set<FilePath>();
  for (const module of stats.modules) {
    for (const name of moduleFileNames(module)) {
      rawPaths.add(name);
    }
    for (const reason of module.reasons ?? []) {
      const importer = reasonImporter(reason, moduleSources);
      if (importer) rawPaths.add(importer);
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
 * @param skipRule Which files to skip; see {@link buildSkipRule}.
 * @param projectFiles How to read the disk.
 *
 * @returns The hash of every on-disk file, and the skipped files with their reasons, both keyed by
 * canonical path.
 */
async function hashOnDiskFiles(
  onDiskFiles: Map<FilePath, AbsolutePath>,
  skipRule: SkipRule,
  projectFiles: ProjectFiles
): Promise<{ hashes: Map<FilePath, FileHash>; skippedFiles: Map<FilePath, SkipReason> }> {
  const { hashable, skipped } = partitionSkipped(onDiskFiles.values(), skipRule);
  const fileHashes = await projectFiles.hashAll(hashable);

  const hashes = new Map<FilePath, FileHash>();
  const skippedFiles = new Map<FilePath, SkipReason>();
  for (const [filePath, absolutePath] of onDiskFiles) {
    const reason = skipped.get(absolutePath);
    if (reason === undefined) {
      hashes.set(filePath, fileHashes[absolutePath]);
    } else {
      hashes.set(filePath, SKIPPED_HASH);
      skippedFiles.set(filePath, reason);
    }
  }
  return { hashes, skippedFiles };
}
