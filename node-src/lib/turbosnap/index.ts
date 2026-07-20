import semver from 'semver';

import { Context } from '../../types';
import missingStatsFile from '../../ui/messages/errors/missingStatsFile';
import { traceChangedFiles as traceChangedFilesV1 } from './1.0';
import { TraceChangedFilesResult } from './types';

/**
 * Determines which story files are affected by the changed git files, bailing out of TurboSnap
 * when necessary.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns The trace result: skipped, bailed, or traced with the affected story files.
 */
export async function traceChangedFiles(ctx: Context): Promise<TraceChangedFilesResult> {
  if (!ctx.turboSnap || ctx.turboSnap.unavailable) return { status: 'skipped' };
  if (!ctx.git.changedFiles) return { status: 'skipped' };
  if (!ctx.fileInfo?.statsPath) {
    // If we don't know the SB version, we should assume we don't support `--stats-json`
    const nonLegacyStatsSupported =
      ctx.storybook?.version &&
      semver.gte(semver.coerce(ctx.storybook.version) || '0.0.0', '8.0.0');

    throw new Error(missingStatsFile({ legacy: !nonLegacyStatsSupported }));
  }

  return traceChangedFilesV1(ctx);
}
