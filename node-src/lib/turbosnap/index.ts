import * as Sentry from '@sentry/node';
import semver from 'semver';

import { readStatsFile } from '../../tasks/readStatsFile';
import { Context } from '../../types';
import missingStatsFile from '../../ui/messages/errors/missingStatsFile';
import { TraceChangedFilesResult } from './types';
import { traceChangedFiles as traceChangedFilesV1 } from './v1';
import { traceChangedFiles as traceChangedFilesV2 } from './v2';
import { getManifestPath } from './v2/manifest';
import { realProjectFiles } from './v2/projectFiles';

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
      ctx.storybook.version && semver.gte(semver.coerce(ctx.storybook.version) || '0.0.0', '8.0.0');

    throw new Error(missingStatsFile({ legacy: !nonLegacyStatsSupported }));
  }

  const statsPath = ctx.fileInfo.statsPath;
  const stats = await readStatsFile(statsPath);

  // V2 catches every anticipated failure itself. A rejection here is a defect in those guards: it
  // must be observable, but it must never affect the v1 decision or the customer's build.
  try {
    await traceChangedFilesV2({
      graphqlClient: ctx.client,
      buildId: ctx.announcedBuild.id,
      stats,
      manifestPath: getManifestPath(ctx.sourceDir),
      projectRoot: ctx.storybook.projectRoot,
      configDir: ctx.storybook.configDir,
      staticDirs: ctx.storybook.staticDirs,
      projectFiles: realProjectFiles(),
    });
  } catch (error) {
    Sentry.captureException(error, {
      fingerprint: ['TurboSnap v2', 'Failed to trace changed files'],
    });
  }

  return traceChangedFilesV1(ctx, stats, statsPath);
}
