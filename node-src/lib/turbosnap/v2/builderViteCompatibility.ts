import { readFileSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import semver from 'semver';

import { Stats } from '../../../types';

const BUILDER_VITE_PACKAGE = '@storybook/builder-vite';

// The CJS proxy importer-edge fix is parked in the Storybook fork for this map. Until it lands in a
// released builder-vite, v2 must not trust Vite stats for production tracing.
const FIRST_BUILDER_VITE_VERSION_WITH_CJS_EDGE_FIX = '10.6.0-alpha.4';

export interface UntrustedBuilderStatsReason {
  reason: 'untrustedBuilderStats';
  subreason: 'packageNotFound' | 'invalidVersion' | 'unsupportedVersion';
  builderName: typeof BUILDER_VITE_PACKAGE;
  builderVersion?: string;
}

/**
 * Returns why TurboSnap v2 should bail for a Vite stats file, or undefined when the stats are not
 * Vite or are produced by a known-fixed builder-vite.
 *
 * @param stats The preview stats file.
 * @param projectRoot The absolute Storybook project root to resolve packages from.
 *
 * @returns The structured untrusted-stats reason, if any.
 */
export function getUntrustedBuilderStatsReason(
  stats: Stats,
  projectRoot: string
): UntrustedBuilderStatsReason | undefined {
  if (!isBuilderViteStats(stats)) return undefined;

  // The version is a proxy for the stats defect, so it rejects a patched or forked builder that
  // still reports an unfixed version. This lets whoever patched it assert their stats are sound.
  // Read inline rather than through getEnvironment because it is deleted along with this gate.
  if (process.env.CHROMATIC_TURBOSNAP_TRUST_BUILDER_STATS) return undefined;

  const version = resolvePackageVersion(projectRoot, BUILDER_VITE_PACKAGE);
  if (!version) {
    return {
      reason: 'untrustedBuilderStats',
      subreason: 'packageNotFound',
      builderName: BUILDER_VITE_PACKAGE,
    };
  }

  if (!semver.valid(version)) {
    return {
      reason: 'untrustedBuilderStats',
      subreason: 'invalidVersion',
      builderName: BUILDER_VITE_PACKAGE,
      builderVersion: version,
    };
  }

  if (semver.lt(version, FIRST_BUILDER_VITE_VERSION_WITH_CJS_EDGE_FIX)) {
    return {
      reason: 'untrustedBuilderStats',
      subreason: 'unsupportedVersion',
      builderName: BUILDER_VITE_PACKAGE,
      builderVersion: version,
    };
  }

  return undefined;
}

/**
 * Whether these stats were produced by builder-vite, told by the builder's own modules appearing in
 * the graph. Also used to check the stats against the builder the project declares; see
 * {@link getAnchorMismatchReason}.
 *
 * @param stats The preview stats file.
 *
 * @returns Whether the stats are builder-vite's.
 */
export function isBuilderViteStats(stats: Stats) {
  return stats.modules.some((module) =>
    [
      module.name,
      module.nameForCondition,
      ...(module.reasons ?? []).map((reason) => reason.moduleName),
    ].some((name) => name?.includes(`${BUILDER_VITE_PACKAGE}/`))
  );
}

function resolvePackageVersion(projectRoot: string, packageName: string): string | undefined {
  const requireFromProject = createRequire(path.join(projectRoot, 'package.json'));

  let packageJsonPath;
  try {
    packageJsonPath = requireFromProject.resolve(`${packageName}/package.json`);
  } catch {
    return undefined;
  }

  const { version } = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  return version;
}
