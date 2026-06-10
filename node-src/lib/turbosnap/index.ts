import * as Sentry from '@sentry/node';
import semver from 'semver';

import { readStatsFile } from '../../tasks/readStatsFile';
import { ChangedPackageFilesBailReason, Context } from '../../types';
import missingStatsFile from '../../ui/messages/errors/missingStatsFile';
import bailFile from '../../ui/messages/warnings/bailFile';
import { checkStorybookBaseDirectory } from '../checkStorybookBaseDirectory';
import { classifyChangedPackageFilesDetail } from './classifyBailDetail';
import { classifyTagsFromError } from './classifyBailRootCause';
import { findChangedDependencies } from './findChangedDependencies';
import { findChangedPackageFiles } from './findChangedPackageFiles';
import { getDependentStoryFiles } from './getDependentStoryFiles';

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

      const changedPackageFiles = await findChangedPackageFiles(ctx, packageMetadataChanges);
      if (changedPackageFiles.length > 0) {
        // Capture original error from findChangedDependencies at the actual bail site. There could
        // be times when findChangedDependencies fails but our fallback works. In those cases, we
        // don't want to capture an error since we were able to recover and didn't bail.
        if (pendingPatch && pendingError) {
          const { bailSubreason } = pendingPatch;
          const additionalTags = await classifyTagsFromError(ctx, pendingError);
          pendingPatch.sentryEventId = Sentry.captureException(pendingError, {
            tags: {
              bail_path: 'findChangedDependencies',
              bail_detail: bailSubreason,
              ...additionalTags,
            },
            // group known bail reasons under one issue per key; let Sentry's default grouping
            // handle unclassified errors so they don't all collapse into a single bucket
            ...(bailSubreason && {
              fingerprint: [bailSubreason],
            }),
          });
        }

        ctx.turboSnap.bailReason = {
          changedPackageFiles,
          ...pendingPatch,
        };
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
