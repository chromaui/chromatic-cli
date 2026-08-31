import * as Sentry from '@sentry/node';
import semver from 'semver';

import { readStatsFile } from '../../tasks/readStatsFile';
import { Context, Stats } from '../../types';
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
  if (!ctx.fileInfo?.statsPath) {
    // If we don't know the SB version, we should assume we don't support `--stats-json`
    const nonLegacyStatsSupported =
      ctx.storybook.version && semver.gte(semver.coerce(ctx.storybook.version) || '0.0.0', '8.0.0');

    throw new Error(missingStatsFile({ legacy: !nonLegacyStatsSupported }));
  }

  const statsPath = ctx.fileInfo.statsPath;
  const stats = await readStatsFile(statsPath);

  // V2 runs for its side effects only; it never affects the v1 decision or the customer's build.
  await runTurboSnapV2(ctx, stats);

  if (!ctx.git.changedFiles || ctx.git.changedFiles.length === 0) {
    return { status: 'skipped' };
  }

  ctx.log.debug('Tracing changed files with TurboSnap v1');
  return traceChangedFilesV1(ctx, stats, statsPath);
}

async function runTurboSnapV2(ctx: Context, stats: Stats): Promise<void> {
  try {
    // Run TurboSnap v2 with scoped Sentry tags so all events from v2 are tagged the same. Then the
    // scope is removed once this function returns.
    await Sentry.withScope(async (scope) => {
      scope.setTag('turbosnap', 'v2');
      ctx.log.debug('Tracing changed files with TurboSnap v2');

      await traceChangedFilesV2({
        log: ctx.log,
        graphqlClient: ctx.client,
        buildId: ctx.announcedBuild.id,
        stats,
        manifestPath: getManifestPath(ctx.sourceDir),
        projectRoot: ctx.storybook.projectRoot,
        configDir: ctx.storybook.configDir,
        staticDirs: ctx.storybook.staticDirs,
        projectFiles: realProjectFiles(ctx.log),
      });
    });
  } catch (error) {
    ctx.log.error(
      'Failed to trace changed files with TurboSnap v2; this does not affect TurboSnap v1',
      error
    );
    Sentry.captureException(error, {
      fingerprint: ['TurboSnap v2', 'Failed to trace changed files'],
    });
  }
}
