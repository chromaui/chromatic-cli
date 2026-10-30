import * as Sentry from '@sentry/node';
import semver from 'semver';

import { readStatsFile } from '../../tasks/readStatsFile';
import { Context, Stats } from '../../types';
import missingStatsFile from '../../ui/messages/errors/missingStatsFile';
import { isHashCollectionDisabled } from './isHashCollectionDisabled';
import { isTurboSnapV1Enabled, shouldTraceWithV1 } from './shouldTraceWithV1';
import { TraceChangedFilesResult } from './types';
import { traceChangedFiles as traceChangedFilesV1 } from './v1';
import { traceChangedFiles as traceChangedFilesV2 } from './v2';
import { getManifestPath } from './v2/manifest';
import { realProjectFiles } from './v2/projectFiles';

/**
 * Determines which story files are affected by the changed git files, bailing out of TurboSnap
 * when necessary.
 * Also attempts to write and upload a v2 hash manifest when hash collection is enabled, even
 * when v1 tracing is skipped. V2 failures do not prevent v1 tracing.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns The trace result: skipped, bailed, or traced with the affected story files.
 *
 * @throws {Error} If v1 is enabled without a stats path, or if reading or parsing the stats file
 * or v1 tracing fails.
 */
export async function traceChangedFiles(ctx: Context): Promise<TraceChangedFilesResult> {
  if (!ctx.fileInfo?.statsPath) {
    if (isTurboSnapV1Enabled(ctx)) {
      throw missingStatsFileError(ctx);
    }

    ctx.log.debug('No stats file; skipping TurboSnap hash collection');
    return { status: 'skipped' };
  }

  const collectHashes = shouldCollectHashes(ctx);
  const traceWithV1 = shouldTraceWithV1(ctx);
  if (!collectHashes && !traceWithV1) {
    return { status: 'skipped' };
  }

  const statsPath = ctx.fileInfo.statsPath;
  const stats = await readStatsFile(statsPath);

  // V2 runs for its side effects only; it never affects the v1 decision or the customer's build.
  if (collectHashes) {
    await runTurboSnapV2(ctx, stats);
  }

  if (!traceWithV1) {
    return { status: 'skipped' };
  }

  ctx.log.debug('Tracing changed files with TurboSnap 1.0');
  return traceChangedFilesV1(ctx, stats, statsPath);
}

function missingStatsFileError(ctx: Context) {
  // If we don't know the SB version, we should assume we don't support `--stats-json`
  const nonLegacyStatsSupported =
    ctx.storybook.version && semver.gte(semver.coerce(ctx.storybook.version) || '0.0.0', '8.0.0');

  return new Error(missingStatsFile({ legacy: !nonLegacyStatsSupported }));
}

// Runs unless the user explicitly opts out of TurboSnap.
function shouldCollectHashes(ctx: Context) {
  return !isHashCollectionDisabled(ctx) && !!ctx.fileInfo?.statsPath;
}

async function runTurboSnapV2(ctx: Context, stats: Stats): Promise<void> {
  // Set the default log level for v2 so errors don't show up in the interactive flow when the user
  // didn't request TurboSnap.
  const turboSnapRequested = !!ctx.turboSnap;
  const failureLogLevel = turboSnapRequested ? 'error' : 'debug';

  if (!turboSnapRequested) {
    ctx.log.debug(
      'Running TurboSnap 2.0 to populate file hashes for future TurboSnap builds. This will not affect what stories are captured.'
    );
  }

  try {
    // Run TurboSnap v2 with scoped Sentry tags so all events from v2 are tagged the same. Then the
    // scope is removed once this function returns.
    await Sentry.withScope(async (scope) => {
      scope.setTag('turbosnap', 'v2');
      // Without this, a refusal from a silent build and one from an opted-in build look the same.
      scope.setTag('turbosnap_requested', turboSnapRequested ? 'true' : 'false');
      // A prebuilt Storybook may run where nothing is installed, so add a tag so we can filter in Sentry.
      scope.setTag('storybook_build_dir', ctx.options.storybookBuildDir ? 'true' : 'false');
      // Add context fields to help us figure out why we're unable to detect Storybook paths.
      scope.setContext('turbosnap_v2', {
        cwd: process.cwd(),
        projectRoot: ctx.storybook.projectRoot,
        configDir: ctx.storybook.configDir,
        storybookBuildDir: ctx.options.storybookBuildDir,
      });
      ctx.log.debug('Tracing changed files with TurboSnap 2.0');

      await traceChangedFilesV2({
        log: ctx.log,
        failureLogLevel,
        onlyChanged: turboSnapRequested,
        graphqlClient: ctx.client,
        buildId: ctx.announcedBuild.id,
        stats,
        manifestPath: getManifestPath(ctx.sourceDir),
        projectRoot: ctx.storybook.projectRoot,
        gitRoot: ctx.git.rootPath,
        untraced: ctx.options.untraced ?? [],
        configDir: ctx.storybook.configDir,
        staticDirs: ctx.storybook.staticDirs,
        externals: ctx.options.externals ?? [],
        projectFiles: realProjectFiles({ log: ctx.log, options: ctx.options }),
      });
    });
  } catch (error) {
    // An error that escaped v2's own handling is the same kind of failure, so it takes the same
    // level rather than always printing.
    ctx.log[failureLogLevel](
      'Failed to trace changed files with TurboSnap 2.0; this does not affect TurboSnap 1.0',
      error
    );
    Sentry.captureException(error);
  }
}
