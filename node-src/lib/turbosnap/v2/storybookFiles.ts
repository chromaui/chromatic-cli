import path from 'path';

import { PREVIEW_CONFIG_PATTERN } from '../../getStorybookMetadata';
import {
  collectTransitiveDependencies,
  FileHash,
  FilePath,
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
 * What the caller already learned about the stories while hashing them, passed in rather than walked
 * again here.
 */
export interface Stories {
  /** The story files themselves, where the globals walk stops. */
  storyFiles: Set<FilePath>;
  /** The union of every story's transitive subtree. */
  reachable: Set<FilePath>;
}

/**
 * Which of the three hashing homes each real file landed in, recorded by the same pass that builds
 * the hashes. Serialization prunes synthetic nodes from the written graph, so a reachability walk
 * over that graph cannot reconstruct these sets — it reports attributed files as unreachable.
 *
 * Every hashed file belongs to at least one set, and the sets can overlap. For example, a file belongs
 * to both `storyReachable` and `storybookGlobals` when it is imported by a story and by Storybook's
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
 * - Hashed files that belong to neither a story subtree nor the preview subtree. This fallback is
 *   needed when builder stats omit the edge from the composition root.
 *
 * From each root, the walk follows dependencies but stops at story files. A composition root can also
 * discover the stories, and following that branch would incorrectly classify all story code as
 * global.
 *
 * Files reached from a composition root remain global even when a story also imports them. Files in
 * the preview subtree are excluded because preview has its own Storybook-wide roll-up.
 *
 * @param files The map of files to their hashes and dependencies.
 * @param hashes The content hashes keyed by canonical file path; a missing entry means no real file.
 * @param stories The story files and their unioned subtrees; see {@link Stories}. The caller unions
 * the subtrees as it hashes each story, so the story graph is walked once rather than here again.
 * Synthetic nodes are filtered out of the attribution below.
 * @param configDirectory The canonical manifest path of the project's Storybook config directory
 * (e.g. `./.storybook`).
 * @param globalRoots Builder-generated composition roots detected by the stats reader. Keeping the
 * detection outside this function lets it work with builder-neutral graph paths.
 * @param h64ToString The hash function.
 *
 * @returns The rolled-up hash per Storybook config file, and the {@link FileAttribution} recording
 * which of the three hashing homes each real file landed in.
 */
export function collectStorybookFiles(
  files: Map<FilePath, TurboSnapFile>,
  hashes: Map<FilePath, FileHash>,
  stories: Stories,
  configDirectory: FilePath,
  globalRoots: Set<FilePath>,
  h64ToString: (input: string) => string
): { storybookConfigHashes: Map<StorybookFileKey, FileHash>; attribution: FileAttribution } {
  // Every preview config subtree, unioned into one `preview` roll-up rather than one entry per path,
  // so the map stays a homogeneous set of category roll-ups (preview, globals, config, static). The
  // shared accumulator is safe because every preview feeds the same hash, so there is no cross-preview
  // leak to keep apart.
  const storybookConfigHashes = new Map<StorybookFileKey, FileHash>();
  const previewSubtree = new Set<FilePath>();
  let hasPreview = false;
  for (const filePath of files.keys()) {
    if (!hashes.has(filePath) || !isPreviewConfig(filePath, configDirectory)) continue;
    hasPreview = true;
    collectTransitiveDependencies(files, filePath, previewSubtree);
  }
  if (hasPreview) {
    storybookConfigHashes.set(
      STORYBOOK_PREVIEW_KEY,
      rollUpFileHashes(hashes, previewSubtree, h64ToString)
    );
  }

  const globalsClosure = new Set<FilePath>();
  for (const globalRoot of globalRoots) {
    collectTransitiveDependencies(files, globalRoot, globalsClosure, stories.storyFiles);
  }
  for (const filePath of hashes.keys()) {
    if (stories.reachable.has(filePath) || previewSubtree.has(filePath)) {
      continue;
    }
    collectTransitiveDependencies(files, filePath, globalsClosure, stories.storyFiles);
  }
  const globals = new Set(
    [...globalsClosure].filter((filePath) => hashes.has(filePath) && !previewSubtree.has(filePath))
  );
  if (globals.size > 0) {
    storybookConfigHashes.set(
      STORYBOOK_GLOBALS_KEY,
      rollUpFileHashes(hashes, globals, h64ToString)
    );
  }

  // Report only real files, matching how the globals set is defined, so the three sets cover exactly
  // the hashed files. The walks pass through synthetic nodes (globs, externals, virtual modules),
  // which have no hash. A file can be in more than one home.
  const attribution: FileAttribution = {
    storyReachable: new Set([...stories.reachable].filter((filePath) => hashes.has(filePath))),
    previewSubtree: new Set([...previewSubtree].filter((filePath) => hashes.has(filePath))),
    storybookGlobals: globals,
  };

  return { storybookConfigHashes, attribution };
}
