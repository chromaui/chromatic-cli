import {
  collectTransitiveDependencies,
  FileHash,
  FilePath,
  rollUpFileHashes,
  TurboSnapFile,
} from './graph';
import { STORYBOOK_GLOBALS_KEY } from './storybookFileKeys';

// Matches `<configDir>/preview.*` on a canonical manifest path. Path matching is the only consistent
// way to find the preview config: the config-entry import edge is spelled three incompatible ways
// across builders (vite has no such edge at all, leaving preview a detached root). `configDir` is a
// project setting, not always `.storybook`, so the pattern is built per call rather than hardcoded.
function previewConfigPattern(configDirectory: string): RegExp {
  const escapedConfigDirectory = configDirectory.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  return new RegExp(String.raw`(^|/)${escapedConfigDirectory}/preview\.[cm]?[jt]sx?$`);
}

/**
 * Which of the three hashing homes each real file landed in, recorded by the same pass that builds
 * the hashes. The graph in `files` is pruned of synthetic nodes after hashing, so a reachability walk
 * over the written manifest cannot reconstruct these sets — it reports attributed files as orphans.
 *
 * The sets are closed over `hashes`: every hashed file lands in a home, and `storybookGlobals` holds
 * exactly the ones in neither of the others. A file can be both story-reachable and in a preview
 * subtree, so the two named homes are not mutually exclusive.
 */
export interface FileAttribution {
  /** Files in some story's transitive subtree, hashed into that story's `storyFiles` entry. */
  storyReachable: Set<FilePath>;
  /** Files in a `.storybook/preview.*` subtree, hashed into that preview's `storybookFiles` entry. */
  previewSubtree: Set<FilePath>;
  /** Files in neither of the above, rolled into the {@link STORYBOOK_GLOBALS_KEY} catch-all. */
  storybookGlobals: Set<FilePath>;
}

/**
 * Builds the file-hash entries of the `storybookFiles` section: a rolled-up hash for each Storybook
 * config file that no story imports. Every hashable file lands in exactly one hashing home — a
 * story's own subtree, a keyed `.storybook/preview.*` entry, or the {@link STORYBOOK_GLOBALS_KEY}
 * catch-all — so nothing goes unhashed and the backend can still attribute a change to the preview
 * config or to a Storybook/framework global.
 *
 * @param files The map of files to their hashes and dependencies.
 * @param hashes The content hashes keyed by canonical file path; a missing entry means no real file.
 * @param storyFileNames The detected story files.
 * @param configDirectory The project's Storybook config directory, project-root-relative (e.g.
 * `.storybook`).
 * @param h64ToString The hash function.
 *
 * @returns The rolled-up hash per Storybook config file, and the {@link FileAttribution} recording
 * which of the three hashing homes each real file landed in.
 */
export function collectStorybookFiles(
  files: Map<FilePath, TurboSnapFile>,
  hashes: Map<FilePath, FileHash>,
  storyFileNames: Set<FilePath>,
  configDirectory: string,
  h64ToString: (input: string) => string
): { storybookFiles: Map<FilePath, FileHash>; attribution: FileAttribution } {
  // The union of every story's subtree, used to tell Storybook globals apart from story code.
  const storyReachable = new Set<FilePath>();
  for (const storyFile of storyFileNames) {
    collectTransitiveDependencies(files, storyFile, storyReachable);
  }

  const previewConfig = previewConfigPattern(configDirectory);
  const storybookFiles = new Map<FilePath, FileHash>();
  const previewSubtree = new Set<FilePath>();
  for (const filePath of files.keys()) {
    if (!hashes.has(filePath) || !previewConfig.test(filePath)) continue;
    // Collect each subtree on its own, then union: sharing one accumulator would leak one preview's
    // files into another's rolled-up hash.
    const subtree = collectTransitiveDependencies(files, filePath);
    storybookFiles.set(filePath, rollUpFileHashes(hashes, subtree, h64ToString));
    for (const dependency of subtree) {
      previewSubtree.add(dependency);
    }
  }

  // Everything else real goes in one catch-all bucket. Membership is defined by *absence* from the
  // story graph and the preview subtree rather than by an import edge, because those edges are
  // unreliable — vite has no config-to-preview edge and rspack drops importer edges. Framework
  // preview annotations and the React runtime land here, and they affect rendering, so leaving them
  // unhashed would be a real blind spot.
  // Derived from `hashes`, not from `files`: a file inside a concatenated module is hashed but only
  // recorded as a dependency of the concatenation root, so filtering `files` would hash it nowhere.
  const orphanGlobals = [...hashes.keys()].filter(
    (filePath) => !storyReachable.has(filePath) && !previewSubtree.has(filePath)
  );
  if (orphanGlobals.length > 0) {
    storybookFiles.set(STORYBOOK_GLOBALS_KEY, rollUpFileHashes(hashes, orphanGlobals, h64ToString));
  }

  // Report only real files, matching how the catch-all is defined, so the three sets cover exactly
  // the hashed files. The walks pass through synthetic nodes (globs, externals, virtual modules),
  // which have no hash. A file can be both story-reachable and in a preview subtree.
  const attribution: FileAttribution = {
    storyReachable: new Set([...storyReachable].filter((filePath) => hashes.has(filePath))),
    previewSubtree: new Set([...previewSubtree].filter((filePath) => hashes.has(filePath))),
    storybookGlobals: new Set(orphanGlobals),
  };

  return { storybookFiles, attribution };
}
