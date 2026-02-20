import semver from 'semver';

import { readStatsFile } from '../../tasks/readStatsFile';
import { Context } from '../../types';
import missingStatsFile from '../../ui/messages/errors/missingStatsFile';
import bailFile from '../../ui/messages/warnings/bailFile';
import { checkStorybookBaseDirectory } from '../checkStorybookBaseDirectory';
import { findChangedDependencies } from './findChangedDependencies';
import { findChangedPackageFiles } from './findChangedPackageFiles';
import { getDependentStoryFiles, normalizePath } from './getDependentStoryFiles';
import { posix } from '../posix';

/**
 * Given a stats module list and the full (unfiltered) list of changed files from git,
 * returns any changed files from outside the baseDir that appear as modules in the stats.
 *
 * This recovers cross-workspace dependencies (e.g., `shared-ui/src/Button.tsx` imported
 * by `web/`) that were pruned during the initial baseDir filter in gitInfo.
 */
function recoverCrossWorkspaceChanges(
  ctx: Context,
  stats: { modules: { name: string; modules?: { name: string }[] }[] },
  changedFiles: string[],
  allChangedFiles: string[]
): string[] {
  if (!allChangedFiles || allChangedFiles.length === changedFiles.length) {
    return changedFiles;
  }

  const { rootPath = '' } = ctx.git || {};
  const { baseDir: baseDirectory = '' } = ctx.storybook || {};

  // Build a set of all normalized module paths from the stats
  const statsModulePaths = new Set<string>();
  for (const module of stats.modules) {
    const normalized = normalizePath(posix(module.name), rootPath, baseDirectory);
    if (normalized) statsModulePaths.add(normalized);
    if (module.modules) {
      for (const subModule of module.modules) {
        const subNormalized = normalizePath(posix(subModule.name), rootPath, baseDirectory);
        if (subNormalized) statsModulePaths.add(subNormalized);
      }
    }
  }

  // Find files that were filtered out but are actually in the dependency graph
  const changedFileSet = new Set(changedFiles);
  const recovered: string[] = [];
  for (const file of allChangedFiles) {
    if (!changedFileSet.has(file) && statsModulePaths.has(file)) {
      recovered.push(file);
    }
  }

  if (recovered.length > 0) {
    ctx.log.info(
      `TurboSnap scope: recovered ${recovered.length} cross-workspace changed files from stats`
    );
    ctx.log.debug(
      `Recovered cross-workspace files:\n${recovered.map((f) => `  ${f}`).join('\n')}`
    );
    return [...changedFiles, ...recovered];
  }

  return changedFiles;
}

// eslint-disable-next-line complexity
export const traceChangedFiles = async (ctx: Context) => {
  if (!ctx.turboSnap || ctx.turboSnap.unavailable) return;
  if (!ctx.git.changedFiles) return;
  if (!ctx.fileInfo?.statsPath) {
    // If we don't know the SB version, we should assume we don't support `--stats-json`
    const nonLegacyStatsSupported =
      ctx.storybook?.version &&
      semver.gte(semver.coerce(ctx.storybook.version) || '0.0.0', '8.0.0');

    ctx.turboSnap.bailReason = { missingStatsFile: true };
    throw new Error(missingStatsFile({ legacy: !nonLegacyStatsSupported }));
  }

  const { statsPath } = ctx.fileInfo;
  const { changedFiles, packageMetadataChanges } = ctx.git;

  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  let changedDependencyNames: void | string[] = [];
  if (packageMetadataChanges?.length) {
    changedDependencyNames = await findChangedDependencies(ctx).catch((err) => {
      const { name, message, stack, code } = err;
      ctx.log.debug({ name, message, stack, code });
    });
    if (changedDependencyNames) {
      ctx.git.changedDependencyNames = changedDependencyNames;
      if (!ctx.options.interactive) {
        const list =
          changedDependencyNames.length > 0
            ? `:\n${changedDependencyNames.map((f) => `  ${f}`).join('\n')}`
            : '';
        ctx.log.info(`Found ${changedDependencyNames.length} changed dependencies${list}`);
      }
    } else {
      ctx.log.warn(`Could not retrieve dependency changes from lockfiles; checking package.json`);

      const changedPackageFiles = await findChangedPackageFiles(ctx, packageMetadataChanges);
      if (changedPackageFiles.length > 0) {
        ctx.turboSnap.bailReason = { changedPackageFiles };
        ctx.log.warn(bailFile({ turboSnap: ctx.turboSnap }));
        return;
      }
    }
  }

  const stats = await readStatsFile(statsPath);

  await checkStorybookBaseDirectory(ctx, stats);

  // Recover cross-workspace changed files that were filtered out by the baseDir scope
  // but are actually present in the stats dependency graph (e.g., shared-ui/src/Button.tsx
  // imported by the current workspace's Storybook).
  const expandedChangedFiles = recoverCrossWorkspaceChanges(
    ctx,
    stats,
    changedFiles,
    ctx.git.allChangedFiles || changedFiles
  );

  return await getDependentStoryFiles(
    ctx,
    stats,
    statsPath,
    expandedChangedFiles,
    changedDependencyNames || []
  );
};

export { findChangedDependencies } from './findChangedDependencies';
export { findChangedPackageFiles } from './findChangedPackageFiles';
export { getDependentStoryFiles } from './getDependentStoryFiles';
