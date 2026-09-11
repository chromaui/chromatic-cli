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
  const runTurboSnapV1 = !!ctx.turboSnap && !ctx.turboSnap.unavailable;

  if (!ctx.fileInfo?.statsPath) {
    if (runTurboSnapV1) {
      throw missingStatsFileError(ctx);
    }

    ctx.log.debug('No stats file; skipping TurboSnap hash collection');
    return { status: 'skipped' };
  }

  const statsPath = ctx.fileInfo.statsPath;
  const stats = await readStatsFile(statsPath);

  // V2 runs for its side effects only; it never affects the v1 decision or the customer's build.
  if (shouldCollectHashes(ctx)) {
    await runTurboSnapV2(ctx, stats);
  }

  if (!runTurboSnapV1 || !ctx.git.changedFiles || ctx.git.changedFiles.length === 0) {
    return { status: 'skipped' };
  }

  ctx.log.debug('Tracing changed files with TurboSnap v1');
  return traceChangedFilesV1(ctx, stats, statsPath);
}

function missingStatsFileError(ctx: Context) {
  // If we don't know the SB version, we should assume we don't support `--stats-json`
  const nonLegacyStatsSupported =
    ctx.storybook.version && semver.gte(semver.coerce(ctx.storybook.version) || '0.0.0', '8.0.0');

  return new Error(missingStatsFile({ legacy: !nonLegacyStatsSupported }));
}

// Asks the filesystem, never what the user requested.
function shouldCollectHashes(ctx: Context) {
  return !ctx.env.CHROMATIC_TURBOSNAP_DISABLE_HASHES && !!ctx.fileInfo?.statsPath;
}

async function runTurboSnapV2(ctx: Context, stats: Stats): Promise<void> {
  // Set the default log level for v2 so errors don't show up in the interactive flow when the user
  // didn't request TurboSnap.
  const turboSnapRequested = !!ctx.turboSnap;
  const failureLogLevel = turboSnapRequested ? 'error' : 'debug';

  try {
    // Run TurboSnap v2 with scoped Sentry tags so all events from v2 are tagged the same. Then the
    // scope is removed once this function returns.
    await Sentry.withScope(async (scope) => {
      scope.setTag('turbosnap', 'v2');
      // Without this, a refusal from a silent build and one from an opted-in build look the same.
      scope.setTag('turbosnap_requested', turboSnapRequested ? 'true' : 'false');
      ctx.log.debug('Tracing changed files with TurboSnap v2');

      await traceChangedFilesV2({
        log: ctx.log,
        failureLogLevel,
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
    // An error that escaped v2's own handling is the same kind of failure, so it takes the same
    // level rather than always printing.
    ctx.log[failureLogLevel](
      'Failed to trace changed files with TurboSnap v2; this does not affect TurboSnap v1',
      error
    );
    Sentry.captureException(error);
  }
}
