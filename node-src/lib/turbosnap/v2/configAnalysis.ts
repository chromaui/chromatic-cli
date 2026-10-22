import path from 'path';

import { MAIN_CONFIG_PATTERN, PREVIEW_CONFIG_PATTERN } from '../../getStorybookMetadata';
import { ConfigEvidenceReason } from './configEvidence';
import { FilePath } from './graph';
import { OutOfGraphFiles } from './outOfGraphFiles';
import { FileAttribution } from './storybookFiles';

/**
 * Preview-graph evidence about the files still covered by the config-directory sweep. These are
 * diagnostic categories, not permission to narrow capture: a story dependency can also be an input
 * to a build transform whose dependencies the preview graph does not record.
 */
export interface ConfigAnalysis {
  mode: 'directory' | 'dependencies';
  reason: ConfigEvidenceReason | 'verified-build-dependencies';
  buildFiles: FilePath[];
  entryFiles: FilePath[];
  storyScopedCandidates: FilePath[];
  globalFiles: FilePath[];
  unattributedFiles: FilePath[];
}

/**
 * Describes opportunities to narrow the config sweep without changing its hashes or skip rules.
 * Missing preview edges never establish that a file is unused or manager-only.
 *
 * @param configDirectory The canonical, project-relative config directory.
 * @param outOfGraphFiles The hashed config, static and external files, after existing skip rules.
 * @param attribution The preview graph's reachability categories.
 * @param buildFiles Verified build-time dependencies, when available.
 *
 * @returns Sorted, portable evidence for diagnostics and migration planning.
 */
export function analyzeConfig(
  configDirectory: FilePath,
  outOfGraphFiles: OutOfGraphFiles,
  attribution: FileAttribution,
  buildFiles: ReadonlySet<FilePath> = new Set()
): ConfigAnalysis {
  const analysis: ConfigAnalysis = {
    mode: 'directory',
    reason: 'build-dependencies-unavailable',
    buildFiles: [...buildFiles].sort((a, b) => a.localeCompare(b)),
    entryFiles: [],
    storyScopedCandidates: [],
    globalFiles: [],
    unattributedFiles: [],
  };

  for (const file of [...outOfGraphFiles.storybookConfigFiles.keys()].sort((a, b) =>
    a.localeCompare(b)
  )) {
    const name = path.posix.basename(file);
    if (path.posix.relative(configDirectory, file) === name && isEntryFile(name)) {
      analysis.entryFiles.push(file);
    } else if (
      [
        attribution.previewSubtree,
        attribution.storybookGlobals,
        buildFiles,
        outOfGraphFiles.staticFiles,
        outOfGraphFiles.externals,
      ].some((files) => files.has(file))
    ) {
      analysis.globalFiles.push(file);
    } else if (attribution.storyReachable.has(file)) {
      analysis.storyScopedCandidates.push(file);
    } else {
      analysis.unattributedFiles.push(file);
    }
  }

  return analysis;
}

function isEntryFile(name: string): boolean {
  return (
    MAIN_CONFIG_PATTERN.test(name) ||
    PREVIEW_CONFIG_PATTERN.test(name) ||
    name === 'preview-head.html' ||
    name === 'preview-body.html'
  );
}
