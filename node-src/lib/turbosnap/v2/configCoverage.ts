import { Stats } from '../../../types';
import { relativeTo } from '../../getStorybookProjectRoot';
import { analyzeConfig } from './configAnalysis';
import { readConfigEvidence } from './configEvidence';
import { FileHash, FilePath, rollUpEntryHashes } from './graph';
import { ManifestInput } from './manifestInput';
import { OutOfGraphFiles } from './outOfGraphFiles';
import { normalizeStatsPath } from './paths';
import { SkipRule } from './skippedFiles';
import {
  BUILD_CONFIGURATION_KEY,
  CONFIG_DEPENDENCY_VERSION,
  CONFIG_DEPENDENCY_VERSION_KEY,
  StorybookFileKey,
} from './storybookFileKeys';
import { FileAttribution } from './storybookFiles';

/**
 * Narrows the directory sweep only when builder evidence establishes that a story dependency is
 * not also a build input. The original sweep remains authoritative on every rejection path.
 *
 * @param stats Original preview stats with optional producer metadata.
 * @param input Project roots and filesystem reads.
 * @param skipRule The existing untraced/gitignore policy.
 * @param attribution Runtime reachability, after applying exclusion boundaries.
 * @param globalRoots Known preview composition roots present in the runtime graph.
 * @param outOfGraphFiles Existing config, static and external sweeps.
 * @param h64ToString The capture hash function.
 *
 * @returns Selected config files, diagnostics and additional global hash categories.
 */
export async function selectConfigCoverage(
  stats: Stats,
  input: ManifestInput,
  skipRule: SkipRule,
  attribution: FileAttribution,
  globalRoots: Set<FilePath>,
  outOfGraphFiles: OutOfGraphFiles,
  h64ToString: (value: string) => string
) {
  const configDirectory = normalizeStatsPath(input.configDir, input.projectRoot);
  const fallback = analyzeConfig(configDirectory, outOfGraphFiles, attribution);
  const hashes = new Map<StorybookFileKey, FileHash>();
  const evidence = await readConfigEvidence(stats, input, skipRule);
  if (evidence.status === 'unavailable') {
    fallback.reason = evidence.reason;
    return { analysis: fallback, files: outOfGraphFiles, hashes };
  }
  if (globalRoots.size === 0) {
    fallback.reason = 'incomplete-build-dependencies';
    return { analysis: fallback, files: outOfGraphFiles, hashes };
  }

  // These are literal file paths, not bundler ids: normalizing them through the runtime graph
  // would strip real filename characters such as !, ? and concatenation-like suffixes.
  const buildHashes = Object.entries(evidence.buildFileHashes).map(
    ([file, hash]): [FilePath, FileHash] => {
      const relative = relativeTo(input.projectRoot, file);
      return [relative.startsWith('../') ? relative : `./${relative}`, hash];
    }
  );
  const buildFiles = new Set(buildHashes.map(([file]) => file));
  const analysis = analyzeConfig(configDirectory, outOfGraphFiles, attribution, buildFiles);
  analysis.mode = 'dependencies';
  analysis.reason = 'verified-build-dependencies';

  const scopedFiles = new Set(analysis.storyScopedCandidates);
  hashes.set(CONFIG_DEPENDENCY_VERSION_KEY, CONFIG_DEPENDENCY_VERSION);
  hashes.set(
    BUILD_CONFIGURATION_KEY,
    rollUpEntryHashes(
      [
        ['capability', evidence.capability],
        ['environment', evidence.environmentHash],
        ...buildHashes,
      ],
      h64ToString
    )
  );

  return {
    analysis,
    hashes,
    files: {
      ...outOfGraphFiles,
      storybookConfigFiles: new Map(
        [...outOfGraphFiles.storybookConfigFiles].filter(([file]) => !scopedFiles.has(file))
      ),
    },
  };
}
