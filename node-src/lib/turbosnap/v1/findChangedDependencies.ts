import fs from 'fs';
import os from 'os';
import path from 'path';

import { checkoutFile, findFilesFromRepositoryRoot, getRepositoryRoot } from '../../../git/git';
import { Context } from '../../../types';
import { SUPPORTED_LOCK_FILES } from '../../utilities';

// Extract the package name from a lockfile resolution string, e.g.
//   "@scope/name@npm:1.2.3"          -> "@scope/name"
//   "name@npm:1.2.3"                 -> "name"
//   "name@patch:name@npm%3A1.0.0#~"  -> "name"
const RESOLUTION_NAME_REGEX = /^(@[^/]+\/[^@]+|[^@]+)@/;
const packageNameFromResolution = (resolution: string): string | undefined => {
  const [, name] = resolution.match(RESOLUTION_NAME_REGEX) || [];
  return name;
};

// Parse a lockfile into the set of canonical `name@protocol:version` resolution strings it contains.
// Works for Yarn Berry (`resolution: "..."`) lockfiles. We deliberately key off the resolution
// string rather than the version range: a resolution only changes when the installed artifact
// changes (version/protocol), which is exactly what can affect a story's rendered output. A pure
// range change that resolves to the same version produces no diff (correctly).
const LOCKFILE_RESOLUTION_REGEX = /^\s+resolution:\s+"([^"]+)"/;
const parseLockfileResolutions = (contents: string): Set<string> => {
  const resolutions = new Set<string>();
  for (const line of contents.split('\n')) {
    const [, resolution] = line.match(LOCKFILE_RESOLUTION_REGEX) || [];
    if (resolution) resolutions.add(resolution);
  }
  return resolutions;
};

// Return the package names whose resolution was added, removed, or changed between two lockfiles.
const diffResolutions = (head: Set<string>, baseline: Set<string>): string[] => {
  const changedNames = new Set<string>();
  const collect = (from: Set<string>, other: Set<string>) => {
    for (const resolution of from) {
      if (!other.has(resolution)) {
        const name = packageNameFromResolution(resolution);
        if (name) changedNames.add(name);
      }
    }
  };
  collect(head, baseline);
  collect(baseline, head);
  return [...changedNames];
};

/**
 * Yields a list of dependency names which have changed since the baseline,
 * e.g. ['react', 'react-dom', '@storybook/react'].
 *
 * This repo (like most Yarn Berry monorepos) uses a single root lockfile shared by every workspace.
 * Resolving each workspace manifest independently (the previous snyk-based approach) is both
 * redundant and prohibitively expensive. Re-resolving the entire package graph from the lockfile
 * lockfile dozens of times in parallel can cause spikes in memory usage. This could silently
 * degrade TurboSnap to "any package.json change disables TurboSnap". Instead we diff the root
 * lockfile once per baseline, which is deterministic, fast, and captures transitive changes too.
 */
export const findChangedDependencies = async (ctx: Context) => {
  const { packageMetadataChanges } = ctx.git;

  if (!packageMetadataChanges?.length) {
    ctx.log.debug('No package metadata changes found');
    return [];
  }

  ctx.log.debug(
    { packageMetadataChanges },
    `Finding changed dependencies for ${packageMetadataChanges.length} baselines`
  );

  const rootPath = (await getRepositoryRoot(ctx)) || '';
  const [rootLockfilePath] =
    (await findFilesFromRepositoryRoot(ctx, rootPath, ...SUPPORTED_LOCK_FILES)) || [];

  if (!rootLockfilePath) {
    throw new Error(
      `Could not find a lockfile (${SUPPORTED_LOCK_FILES.join(' / ')}) at the repository root`
    );
  }

  // All workspaces share a single root lockfile, so we only need to diff baselines where the
  // lockfile itself changed. A manifest-only change that did not alter the lockfile cannot change an
  // installed version, so it has no dependency impact on the rendered stories.
  const baselineCommits = [
    ...new Set(
      packageMetadataChanges
        .filter(({ changedFiles }) => changedFiles.includes(rootLockfilePath))
        .map(({ commit }) => commit)
    ),
  ];

  if (baselineCommits.length === 0) {
    ctx.log.debug('No lockfile changes found in package metadata changes');
    return [];
  }

  // Parse the HEAD lockfile once.
  const headResolutions = parseLockfileResolutions(
    fs.readFileSync(path.join(rootPath, rootLockfilePath), 'utf8')
  );

  const changedDependencyNames = new Set<string>();

  for (const commit of baselineCommits) {
    // Read the baseline lockfile via git into a temp file. If it is missing (e.g. an unreachable
    // baseline commit) `checkoutFile` throws, and the caller falls back to its conservative
    // package-file behavior — so we never silently miss a dependency change.
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromatic'));
    try {
      await checkoutFile(ctx, commit, rootLockfilePath, tmpdir);
      const baselineResolutions = parseLockfileResolutions(
        fs.readFileSync(path.join(tmpdir, rootLockfilePath), 'utf8')
      );
      for (const name of diffResolutions(headResolutions, baselineResolutions)) {
        changedDependencyNames.add(name);
      }
    } finally {
      fs.rmSync(tmpdir, { recursive: true, force: true });
    }
  }

  return [...changedDependencyNames];
};
