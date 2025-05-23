import semver from 'semver';

import { readStatsFile } from '../../tasks/readStatsFile';
import { Context } from '../../types';
import missingStatsFile from '../../ui/messages/errors/missingStatsFile';
import bailFile from '../../ui/messages/warnings/bailFile';
import { checkStorybookBaseDirectory } from '../checkStorybookBaseDirectory';
import { findChangedDependencies } from './findChangedDependencies';
import { findChangedPackageFiles } from './findChangedPackageFiles';
import { getDependentStoryFiles } from './getDependentStoryFiles';

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

      const changedPackageFiles = await findChangedPackageFiles(packageMetadataChanges);
      if (changedPackageFiles.length > 0) {
        ctx.turboSnap.bailReason = { changedPackageFiles };
        ctx.log.warn(bailFile({ turboSnap: ctx.turboSnap }));
        return;
      }
    }
  }

  const stats = await readStatsFile(statsPath);

  await checkStorybookBaseDirectory(ctx, stats);

  return await getDependentStoryFiles(
    ctx,
    stats,
    statsPath,
    changedFiles,
    changedDependencyNames || []
  );
};

export { findChangedDependencies } from './findChangedDependencies';
export { findChangedPackageFiles } from './findChangedPackageFiles';
export { getDependentStoryFiles } from './getDependentStoryFiles';
