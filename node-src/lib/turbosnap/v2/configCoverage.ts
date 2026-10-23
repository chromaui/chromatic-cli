import { Stats } from '../../../types';
import { analyzeConfig } from './configAnalysis';
import { readConfigEvidence } from './configEvidence';
import { FilePath, rollUpEntryHashes } from './graph';
import { ManifestInput } from './manifestInput';
import { OutOfGraphFiles } from './outOfGraphFiles';
import { normalizeStatsPath } from './paths';
import { FileAttribution } from './storybookFiles';

export interface ConfigCoverage {
  version: 1;
  stableConfigHash: string;
  globalOutputHash: string;
  storyOutputHashes: Record<string, string>;
}

/**
 * Proposes a narrower config hash for ancestor comparison, while retaining every legacy hash.
 * Only the backend can waive a bailout, after comparing both builds' final output evidence.
 *
 * @param stats Original preview stats with optional output evidence.
 * @param input Project and output roots, and filesystem operations.
 * @param attribution Runtime reachability after exclusions.
 * @param globalRoots Known preview composition roots in the runtime graph.
 * @param storyFiles Story files whose output must be covered.
 * @param outOfGraphFiles Existing config, static and external sweeps.
 * @param h64ToString The capture hash function.
 *
 * @returns Diagnostics and optional evidence for a conditional config-directory waiver.
 */
export async function selectConfigCoverage(
  stats: Stats,
  input: ManifestInput,
  attribution: FileAttribution,
  globalRoots: Set<FilePath>,
  storyFiles: Set<FilePath>,
  outOfGraphFiles: OutOfGraphFiles,
  h64ToString: (value: string) => string
): Promise<{ analysis: ReturnType<typeof analyzeConfig>; configCoverage?: ConfigCoverage }> {
  const analysis = analyzeConfig(
    normalizeStatsPath(input.configDir, input.projectRoot),
    outOfGraphFiles,
    attribution
  );
  const evidence = await readConfigEvidence(stats, input);
  if (evidence.status === 'unavailable') {
    analysis.reason = evidence.reason;
    return { analysis };
  }
  if (
    globalRoots.size === 0 ||
    storyFiles.size === 0 ||
    [...storyFiles].some((file) => !Object.hasOwn(evidence.storyOutputHashes, file))
  ) {
    analysis.reason = 'incomplete-output-evidence';
    return { analysis };
  }
  analysis.mode = 'output';
  analysis.reason = 'verified-output-evidence';
  const candidates = new Set(analysis.storyScopedCandidates);
  return {
    analysis,
    configCoverage: {
      version: 1,
      stableConfigHash: rollUpEntryHashes(
        [...outOfGraphFiles.storybookConfigFiles].filter(([file]) => !candidates.has(file)),
        h64ToString
      ),
      globalOutputHash: evidence.globalOutputHash,
      storyOutputHashes: Object.fromEntries(
        [...storyFiles].sort().map((file) => [file, evidence.storyOutputHashes[file]])
      ),
    },
  };
}
