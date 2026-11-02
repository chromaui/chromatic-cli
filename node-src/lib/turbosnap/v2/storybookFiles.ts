import path from 'path';

import { PREVIEW_CONFIG_PATTERN } from '../../getStorybookMetadata';
import {
  collectTransitiveDependencies,
  FileHash,
  FilePath,
  hasContentHash,
  rollUpFileHashes,
  TurboSnapFile,
} from './graph';
import {
  STORYBOOK_GLOBALS_KEY,
  STORYBOOK_PREVIEW_KEY,
  StorybookFileKey,
} from './storybookFileKeys';

/**
 * Whether a canonical manifest path is the project's `<configDir>/preview.*` config file. Canonical
 * in-project keys start `./`, so a preview under node_modules (keyed elsewhere) is not mistaken for
 * the project's. Path matching is the only consistent way to find it: the config-entry import edge is
 * spelled three incompatible ways across builders (vite has no such edge at all, leaving preview a
 * detached root). `configDir` is a project setting, not always `.storybook`.
 *
 * @param filePath The canonical manifest path to test.
 * @param configDirectory The canonical manifest path of the project's Storybook config directory.
 *
 * @returns Whether the path is the project's preview config file.
 */
function isPreviewConfig(filePath: FilePath, configDirectory: FilePath): boolean {
  const { dir, base } = path.posix.parse(filePath);
  return dir === configDirectory && PREVIEW_CONFIG_PATTERN.test(base);
}

/**
 * Which of the three hashing homes each real file landed in, recorded by the same pass that builds
 * the hashes. Serialization prunes synthetic nodes from the written graph, so a reachability walk
 * over that graph cannot reconstruct these sets — it reports attributed files as unreachable.
 *
 * Every hashed file belongs to at least one set, except one only an untraced file reaches, which
 * the user asked to leave out of every roll-up. The sets can overlap. For example, a file belongs to
 * both `storyReachable` and `storybookGlobals` when it is imported by a story and by Storybook's
 * global composition code. This is intentional: the story hash identifies the affected story, while
 * the globals hash records that the same change can affect every story.
 */
export interface FileAttribution {
  /**
   * Files that can affect every story: what the builder's global composition roots reach, plus
   * everything in no story or preview subtree and what those files import. Hashed into the shared
   * {@link STORYBOOK_GLOBALS_KEY} `storybookConfigHashes` entry.
   */
  storybookGlobals: Set<FilePath>;
  /** Files in a `.storybook/preview.*` subtree, hashed into the shared `preview` `storybookConfigHashes` entry. */
  previewSubtree: Set<FilePath>;
  /** Files in some story's transitive subtree, hashed into that story's `storyFiles` entry. */
  storyReachable: Set<FilePath>;
}

/**
 * Builds the file-hash entries of the `storybookConfigHashes` section: one rolled-up hash for the
 * preview config subtree and one for the Storybook globals. Every hashable file lands in at least one
 * hashing home — a story's own subtree, the shared {@link STORYBOOK_PREVIEW_KEY} entry, or the
 * {@link STORYBOOK_GLOBALS_KEY} roll-up — so nothing goes unhashed and the backend can still
 * attribute a change to the preview config or to a Storybook/framework global.
 *
 * The globals roll-up starts from two kinds of roots:
 *
 * - Builder-generated composition roots. Their dependencies are Storybook's preview annotations,
 *   which are loaded for every story.
 * - Hashed files that belong to neither a story subtree nor the preview subtree, and that no
 *   untraced file reaches. This fallback is needed when builder stats omit the edge from the
 *   composition root; a file behind an untraced wall is unreached by design, not by omission, and
 *   adopting it would turn the user's "never recapture" into "recapture everything".
 *
 * From each root, the walk follows dependencies but stops at story files. A composition root can also
 * discover the stories, and following that branch would incorrectly classify all story code as
 * global.
 *
 * Files reached from a composition root remain global even when a story also imports them. Files in
 * the preview subtree are excluded because preview has its own Storybook-wide roll-up.
 *
 * @param files The map of files to their hashes and dependencies.
 * @param hashes The hash of every on-disk file, keyed by canonical path, or `SKIPPED_HASH` for a file v2 skipped.
 * A missing entry means no file on disk; see `hasContentHash`.
 * @param storyFiles The canonical paths of the story files. Their subtrees are walked here, so the
 * story-reachable set always agrees with `files`. Synthetic nodes are filtered out of the
 * attribution below.
 * @param configDirectory The canonical manifest path of the project's Storybook config directory
 * (e.g. `./.storybook`).
 * @param globalRoots Builder-generated composition roots detected by the stats reader. Keeping the
 * detection outside this function lets it work with builder-neutral graph paths.
 * @param untracedSubtrees The untraced files and everything they reached before their edges were
 * severed; see `StatsGraph.untracedSubtrees`.
 * @param h64ToString The hash function.
 * @param rollUpPath The path each file is rolled up under; see `buildRollUpPath`.
 *
 * @returns The rolled-up hash per Storybook config file, and the {@link FileAttribution} recording
 * which of the three hashing homes each real file landed in.
 */
export function collectStorybookFiles(
  files: Map<FilePath, TurboSnapFile>,
  hashes: Map<FilePath, FileHash>,
  storyFiles: Set<FilePath>,
  configDirectory: FilePath,
  globalRoots: Set<FilePath>,
  untracedSubtrees: Set<FilePath>,
  h64ToString: (input: string) => string,
  rollUpPath: (filePath: FilePath) => FilePath
): { storybookConfigHashes: Map<StorybookFileKey, FileHash>; attribution: FileAttribution } {
  // Every preview config subtree, unioned into one `preview` roll-up rather than one entry per path,
  // so the map stays a homogeneous set of category roll-ups (preview, globals, config, static). The
  // shared accumulator is safe because every preview feeds the same hash, so there is no cross-preview
  // leak to keep apart.
  const storybookConfigHashes = new Map<StorybookFileKey, FileHash>();
  // A skipped preview still roots the subtree: an untracked preview keeps its edges, so the tracked
  // files it imports roll up here rather than falling through to globals. The roll-up leaves the
  // skipped file itself out (see `rollUpFileHashes`), and like the globals entry it is omitted when
  // nothing hashed is left, as when the preview is untraced and so has no edges to follow.
  const previewSubtree = new Set<FilePath>();
  for (const filePath of files.keys()) {
    if (!hashes.has(filePath) || !isPreviewConfig(filePath, configDirectory)) continue;
    collectTransitiveDependencies(files, filePath, previewSubtree);
  }
  const previewFiles = contentHashed(hashes, previewSubtree);
  if (previewFiles.size > 0) {
    storybookConfigHashes.set(
      STORYBOOK_PREVIEW_KEY,
      rollUpFileHashes(hashes, previewSubtree, h64ToString, rollUpPath)
    );
  }

  const storyReachable = new Set<FilePath>();
  for (const storyFile of storyFiles) {
    collectTransitiveDependencies(files, storyFile, storyReachable);
  }

  const globalsClosure = collectGlobalsClosure(
    files,
    globalRoots,
    storyFiles,
    [...hashes.keys()].filter(
      (filePath) =>
        hasContentHash(hashes, filePath) &&
        !storyReachable.has(filePath) &&
        !previewSubtree.has(filePath) &&
        !untracedSubtrees.has(filePath)
    )
  );
  const globals = new Set(
    [...globalsClosure].filter(
      (filePath) => hasContentHash(hashes, filePath) && !previewSubtree.has(filePath)
    )
  );
  if (globals.size > 0) {
    storybookConfigHashes.set(
      STORYBOOK_GLOBALS_KEY,
      rollUpFileHashes(hashes, globals, h64ToString, rollUpPath)
    );
  }

  // Report only content-hashed files, matching how the globals set is defined, so the three sets cover
  // exactly the files that feed a hash. The walks pass through synthetic nodes (globs, externals,
  // virtual modules) and skipped files, which feed none. A file can be in more than one home.
  const attribution: FileAttribution = {
    storyReachable: contentHashed(hashes, storyReachable),
    previewSubtree: previewFiles,
    storybookGlobals: globals,
  };

  return { storybookConfigHashes, attribution };
}

/**
 * Narrows a walked set to the files that feed a hash; see {@link hasContentHash}.
 *
 * @param hashes The hash of every on-disk file, keyed by canonical path.
 * @param filePaths The paths a walk reached, synthetic nodes and skipped files included.
 *
 * @returns The content-hashed files among them.
 */
function contentHashed(hashes: Map<FilePath, FileHash>, filePaths: Set<FilePath>): Set<FilePath> {
  return new Set([...filePaths].filter((filePath) => hasContentHash(hashes, filePath)));
}

/**
 * Walks the globals closure from the builder's composition roots and from the hashed files that
 * belong to no story subtree and no preview subtree. Both walks stop at story files, so a root that
 * also discovers the stories does not pull story code into globals.
 *
 * @param files The map of files to their hashes and dependencies.
 * @param globalRoots Builder-generated composition roots detected by the stats reader.
 * @param storyFiles The story files, where every walk stops.
 * @param unhomedFiles The hashed files in no story subtree and no preview subtree.
 *
 * @returns Every path the walks reached, synthetic nodes included.
 */
function collectGlobalsClosure(
  files: Map<FilePath, TurboSnapFile>,
  globalRoots: Set<FilePath>,
  storyFiles: Set<FilePath>,
  unhomedFiles: FilePath[]
): Set<FilePath> {
  const closure = new Set<FilePath>();
  for (const root of [...globalRoots, ...unhomedFiles]) {
    collectTransitiveDependencies(files, root, closure, storyFiles);
  }
  return closure;
}
