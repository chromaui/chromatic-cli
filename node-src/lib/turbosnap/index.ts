import * as Sentry from '@sentry/node';
import semver from 'semver';

import { readStatsFile } from '../../tasks/readStatsFile';
import { Context, HashBasedTurboSnap, Stats } from '../../types';
import missingStatsFile from '../../ui/messages/errors/missingStatsFile';
import { isHashCollectionDisabled } from './isHashCollectionDisabled';
import { isTurboSnapV1Enabled, shouldTraceWithV1 } from './shouldTraceWithV1';
import { TurboSnapResult } from './types';
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
 * When the Index applies v2 to the build, v1 still traces and its result is still sent, but its
 * warnings and info logs drop to debug: the Index ignores that result, so they would contradict
 * what gets captured. Setting CHROMATIC_TURBOSNAP_DISABLE_V1 skips v1 entirely in that case.
 *
 * @param ctx The context set when executing the CLI.
 * @param hooks Callbacks into the caller's progress reporting.
 * @param hooks.onTraceWithV1 Called just before v1 tracing starts, unless the Index applied v2.
 *
 * @returns The trace result: skipped, bailed, or traced with the affected story files, plus the
 * Index's v2 decision when it applies v2.
 *
 * @throws {Error} If v1 is enabled without a stats path, or if reading or parsing the stats file
 * or v1 tracing fails.
 */
export async function traceChangedFiles(
  ctx: Context,
  { onTraceWithV1 }: { onTraceWithV1?: () => void } = {}
): Promise<TurboSnapResult> {
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
  // V2 never affects the v1 decision; it only reports whether the Index applies v2 to this build.
  const hashBased = collectHashes ? await runTurboSnapV2(ctx, stats) : undefined;

  if (!traceWithV1) {
    return { status: 'skipped', ...(hashBased && { hashBased }) };
  }

  return runTurboSnapV1(ctx, stats, statsPath, { hashBased, onTraceWithV1 });
}

// Playwright and Cypress report no module graph, so their generated story files reach no tracked
// files and would hash the same on every build, and TurboSnap 2.0 could skip captures that changed.
function shouldCollectHashes(ctx: Context) {
  return !isHashCollectionDisabled(ctx) && !ctx.options.playwright && !ctx.options.cypress;
}

// The Index ignores v1's result when it applies v2, so v1 then traces without reporting progress
// and with its warnings and info logs dropped to debug, or not at all when the user opted out.
async function runTurboSnapV1(
  ctx: Context,
  stats: Stats,
  statsPath: string,
  { hashBased, onTraceWithV1 }: { hashBased?: HashBasedTurboSnap; onTraceWithV1?: () => void }
): Promise<TurboSnapResult> {
  if (shouldSkipV1(ctx, hashBased)) {
    return { status: 'skipped', hashBased };
  }

  ctx.log.debug('Tracing changed files with TurboSnap 1.0');
  if (!hashBased) {
    onTraceWithV1?.();
    return traceChangedFilesV1(ctx, stats, statsPath);
  }

  const log = { ...ctx.log, info: ctx.log.debug, warn: ctx.log.debug };
  const result = await traceChangedFilesV1({ ...ctx, log }, stats, statsPath);
  return { ...result, hashBased };
}

// Users can skip v1 with CHROMATIC_TURBOSNAP_DISABLE_V1 because tracing can be slow on large
// projects. It applies only when the Index applies v2, since otherwise the Index decides the build
// with v1's result.
function shouldSkipV1(ctx: Context, hashBased: HashBasedTurboSnap | undefined) {
  if (!ctx.env.CHROMATIC_TURBOSNAP_DISABLE_V1) {
    return false;
  }

  ctx.log.debug(
    hashBased
      ? 'CHROMATIC_TURBOSNAP_DISABLE_V1 is set and Chromatic applied TurboSnap 2.0 to this build; skipping TurboSnap 1.0'
      : 'CHROMATIC_TURBOSNAP_DISABLE_V1 is set, but Chromatic did not apply TurboSnap 2.0 to this build; tracing with TurboSnap 1.0'
  );
  return !!hashBased;
}

function missingStatsFileError(ctx: Context) {
  // If we don't know the SB version, we should assume we don't support `--stats-json`
  const nonLegacyStatsSupported =
    ctx.storybook.version && semver.gte(semver.coerce(ctx.storybook.version) || '0.0.0', '8.0.0');

  return new Error(missingStatsFile({ legacy: !nonLegacyStatsSupported }));
}

async function runTurboSnapV2(ctx: Context, stats: Stats): Promise<HashBasedTurboSnap | undefined> {
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
    return await Sentry.withScope(async (scope) => {
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

      const result = await traceChangedFilesV2({
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
        ...(ctx.options.vitest && { e2ePackage: '@chromatic-com/vitest' }),
        staticDirs: ctx.storybook.staticDirs,
        externals: ctx.options.externals ?? [],
        projectFiles: realProjectFiles({ log: ctx.log, options: ctx.options }),
      });
      return result.status === 'fallback' ? result.hashBased : undefined;
    });
  } catch (error) {
    // An error that escaped v2's own handling is the same kind of failure, so it takes the same
    // level rather than always printing.
    ctx.log[failureLogLevel](
      'Failed to trace changed files with TurboSnap 2.0; this does not affect TurboSnap 1.0',
      error
    );
    Sentry.captureException(error);
    return undefined;
  }
}
