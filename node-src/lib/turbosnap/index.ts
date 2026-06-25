import semver from 'semver';

import { readStatsFile } from '../../tasks/readStatsFile';
import { ChangedPackageFilesBailReason, Context } from '../../types';
import missingStatsFile from '../../ui/messages/errors/missingStatsFile';
import bailFile from '../../ui/messages/warnings/bailFile';
import { checkStorybookBaseDirectory } from '../checkStorybookBaseDirectory';
import { captureBailException } from './captureBailException';
import { classifyChangedPackageFilesDetail } from './classifyBailDetail';
import { classifyTagsFromError } from './classifyBailRootCause';
import { findChangedDependencies } from './findChangedDependencies';
import { findChangedPackageFiles } from './findChangedPackageFiles';
import { getDependentStoryFiles } from './getDependentStoryFiles';
import { getPackageFilesInBuild } from './getPackageFilesInBuild';

// eslint-disable-next-line complexity, max-statements
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
  let pendingError: unknown;
  let pendingPatch: Partial<ChangedPackageFilesBailReason> | undefined;
  // Package files whose dependency changes we couldn't resolve from the lockfiles. We don't bail on
  // these immediately because a changed (or newly added) package.json may belong to a monorepo
  // package that isn't part of the Storybook build. Instead we defer the decision until we've read
  // the stats file, then only bail if one of these files is actually relevant to the build.
  let unresolvedPackageFiles: string[] = [];
  if (packageMetadataChanges?.length) {
    changedDependencyNames = await findChangedDependencies(ctx).catch((err) => {
      pendingError = err;
      pendingPatch = classifyChangedPackageFilesDetail(err);

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
      unresolvedPackageFiles = await findChangedPackageFiles(ctx, packageMetadataChanges);
    }
  }

  const stats = await readStatsFile(statsPath);

  await checkStorybookBaseDirectory(ctx, stats);

  if (unresolvedPackageFiles.length > 0) {
    // Only bail on package files that actually map to modules included in the Storybook build.
    // Unrelated package files (e.g. an added package.json in a sibling monorepo package) are
    // ignored so they don't take down the whole build.
    const changedPackageFiles = getPackageFilesInBuild(ctx, stats, unresolvedPackageFiles);
    if (changedPackageFiles.length > 0) {
      // Capture original error from findChangedDependencies at the actual bail site. There could
      // be times when findChangedDependencies fails but our fallback works. In those cases, we
      // don't want to capture an error since we were able to recover and didn't bail.
      if (pendingPatch && pendingError) {
        pendingPatch.sentryEventId = captureBailException(pendingError, {
          bailSubreason: pendingPatch.bailSubreason,
          bailPath: 'findChangedDependencies',
          additionalTags: await classifyTagsFromError(ctx, pendingError),
        });
      }

      ctx.turboSnap.bailReason = {
        changedPackageFiles,
        ...pendingPatch,
      };
      ctx.log.warn(bailFile({ turboSnap: ctx.turboSnap }));
      return;
    }

    ctx.log.debug(
      { unresolvedPackageFiles },
      'Ignoring changed package files that are not part of the Storybook build'
    );
  }

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
