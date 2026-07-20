import { readStatsFile } from '../../../tasks/readStatsFile';
import { ChangedPackageFilesBailReason, Context, TurboSnap } from '../../../types';
import bailFile from '../../../ui/messages/warnings/bailFile';
import { checkStorybookBaseDirectory } from '../../checkStorybookBaseDirectory';
import { TraceChangedFilesResult } from '../types';
import { captureBailException } from './captureBailException';
import { classifyChangedPackageFilesDetail } from './classifyBailDetail';
import { classifyTagsFromError } from './classifyBailRootCause';
import { findChangedDependencies } from './findChangedDependencies';
import { findChangedPackageFiles } from './findChangedPackageFiles';
import { getDependentStoryFiles } from './getDependentStoryFiles';

/**
 * Determines which story files are affected by the changed git files, bailing out of TurboSnap
 * when necessary.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns The trace result: skipped, bailed, or traced with the affected story files.
 */
// eslint-disable-next-line complexity
export async function traceChangedFiles(ctx: Context): Promise<TraceChangedFilesResult> {
  // The caller checks for ctx.fileInfo.statsPath before calling this function, so we can safely assert that it exists
  // here.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const { statsPath } = ctx.fileInfo!;
  const { changedFiles = [], packageMetadataChanges } = ctx.git;

  // Only set when lockfile analysis ran and succeeded; an empty array means "no changes found".
  let changedDependencyNames: string[] | undefined;
  let pendingError: unknown;
  let pendingPatch: Partial<ChangedPackageFilesBailReason> | undefined;
  if (packageMetadataChanges?.length) {
    changedDependencyNames = await findChangedDependencies(ctx).catch((err) => {
      pendingError = err;
      pendingPatch = classifyChangedPackageFilesDetail(err);

      const { name, message, stack, code } = err;
      ctx.log.debug({ name, message, stack, code });
      return undefined;
    });
    if (changedDependencyNames) {
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
          pendingPatch.sentryEventId = captureBailException(pendingError, {
            bailSubreason: pendingPatch.bailSubreason,
            bailPath: 'findChangedDependencies',
            additionalTags: await classifyTagsFromError(ctx, pendingError),
          });
        }

        const turboSnap: TurboSnap = {
          ...ctx.turboSnap,
          bailReason: { changedPackageFiles, ...pendingPatch },
        };
        ctx.log.warn(bailFile({ turboSnap }));
        return { status: 'bailed', turboSnap };
      }
    }
  }

  const stats = await readStatsFile(statsPath);

  await checkStorybookBaseDirectory(ctx, stats);

  const result = await getDependentStoryFiles(
    ctx,
    stats,
    statsPath,
    changedFiles,
    changedDependencyNames || []
  );

  if (result.status === 'bailed') {
    return result;
  }

  return { ...result, changedDependencyNames };
}

export { findChangedDependencies } from './findChangedDependencies';
export { findChangedPackageFiles } from './findChangedPackageFiles';
export { getDependentStoryFiles } from './getDependentStoryFiles';
