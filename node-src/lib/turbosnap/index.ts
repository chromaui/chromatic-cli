import * as Sentry from '@sentry/node';
import { readdir, realpath } from 'fs/promises';
import semver from 'semver';

import { readStatsFile } from '../../tasks/readStatsFile';
import { HashBasedTurboSnap, Stats, TurboSnapOutcome, UntracedFile } from '../../types';
import missingStatsFile from '../../ui/messages/errors/missingStatsFile';
import untracedStorybookConfig from '../../ui/messages/warnings/untracedStorybookConfig';
import { relativeTo } from '../getStorybookProjectRoot';
import { matchesFile } from '../utilities';
import { getE2EPackage } from './e2ePackage';
import { isHashCollectionDisabled } from './isHashCollectionDisabled';
import { isTurboSnapV1Enabled, shouldTraceWithV1 } from './shouldTraceWithV1';
import { storybookConfigFileKind } from './storybookConfigFiles';
import {
  TraceChangedFilesResult,
  TurboSnapInput,
  TurboSnapResult,
  TurboSnapV1Input,
} from './types';
import { traceChangedFiles as traceChangedFilesV1 } from './v1';
import { traceChangedFiles as traceChangedFilesV2 } from './v2';
import { getManifestPath } from './v2/manifest';
import { realProjectFiles } from './v2/projectFiles';

type TraceWithV2Result = TraceChangedFilesResult & { hashBased?: HashBasedTurboSnap };

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
 * @param input What TurboSnap reads: the build, its stats file, git state, and options.
 * @param hooks Callbacks into the caller's progress reporting.
 * @param hooks.onTraceWithV1 Called just before v1 tracing starts, unless the Index applied v2.
 *
 * @returns The trace result: skipped, bailed, or traced with the affected story files, plus which
 * TurboSnap decides the build.
 *
 * @throws {Error} If v1 is enabled without a stats path, or if v1 traces and reading the stats file
 * or tracing fails.
 */
export async function traceChangedFiles(
  input: TurboSnapInput,
  hooks: { onTraceWithV1?: () => void } = {}
): Promise<TurboSnapResult> {
  const { hashBased, ...result } = await traceWithBothGenerations(input, hooks);
  return { ...result, outcome: getOutcome(input, result, hashBased) };
}

// The Index decides with v2 whenever it applies it, bailed or not. Otherwise v1 decides when the
// user asked for TurboSnap, and anything short of a trace means a full build.
function getOutcome(
  input: TurboSnapInput,
  result: TraceChangedFilesResult,
  hashBased: HashBasedTurboSnap | undefined
): TurboSnapOutcome {
  if (hashBased) {
    return { mechanism: 'v2', ...hashBased };
  }
  if (isTurboSnapV1Enabled(input)) {
    return { mechanism: 'v1', bailed: result.status !== 'traced' };
  }
  return { mechanism: 'none' };
}

async function traceWithBothGenerations(
  input: TurboSnapInput,
  { onTraceWithV1 }: { onTraceWithV1?: () => void }
): Promise<TraceWithV2Result> {
  const { statsPath, buildId } = input;
  if (!statsPath) {
    if (isTurboSnapV1Enabled(input)) {
      throw missingStatsFileError(input);
    }

    input.log.debug('No stats file; skipping TurboSnap hash collection');
    return { status: 'skipped' };
  }

  // Sharing a Storybook announces no build, so there is nothing to attach hashes to.
  const collectHashes = !!buildId && shouldCollectHashes(input);
  const traceWithV1 = shouldTraceWithV1(input);
  if (!collectHashes && !traceWithV1) {
    return { status: 'skipped' };
  }

  await logUntracedStorybookConfig(input);

  if (!traceWithV1) {
    const hashBased = collectHashes
      ? await collectHashesWithoutV1(input, statsPath, buildId)
      : undefined;
    return { status: 'skipped', ...(hashBased && { hashBased }) };
  }

  const stats = await readStatsFile(statsPath);
  // V2 never affects the v1 decision; it only reports whether the Index applies v2 to this build.
  const hashBased = collectHashes ? await runTurboSnapV2(input, stats, buildId) : undefined;
  return runTurboSnapV1(input, stats, statsPath, { hashBased, onTraceWithV1 });
}

// Without v1 tracing, the stats only feed hash collection, which never fails the build, so an
// unreadable stats file skips it instead.
async function collectHashesWithoutV1(input: TurboSnapInput, statsPath: string, buildId: string) {
  const stats = await readStatsFile(statsPath).catch((error: unknown) => {
    input.log[input.turboSnap ? 'warn' : 'debug'](
      "Failed to read the stats file, so TurboSnap 2.0 didn't collect hashes for this build",
      error
    );
    return undefined;
  });
  return stats && runTurboSnapV2(input, stats, buildId);
}

// Playwright and Cypress report no module graph, so their generated story files reach no tracked
// files and would hash the same on every build, and TurboSnap 2.0 could skip captures that changed.
function shouldCollectHashes(ctx: TurboSnapInput) {
  return !isHashCollectionDisabled(ctx) && !ctx.options.playwright && !ctx.options.cypress;
}

// The Index ignores v1's result when it applies v2, so v1 then traces without reporting progress
// and with its warnings and info logs dropped to debug, or not at all when the user opted out.
async function runTurboSnapV1(
  ctx: TurboSnapV1Input,
  stats: Stats,
  statsPath: string,
  { hashBased, onTraceWithV1 }: { hashBased?: HashBasedTurboSnap; onTraceWithV1?: () => void }
): Promise<TraceWithV2Result> {
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
function shouldSkipV1(ctx: TurboSnapV1Input, hashBased: HashBasedTurboSnap | undefined) {
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

const realPathOrSelf = (absolutePath: string) => realpath(absolutePath).catch(() => absolutePath);

// `--untraced` applies to the allowlisted Storybook config files too, though changing them can affect
// every story. When a glob matches one on disk, warn once per build, whether or not it changed. The
// warning is only logged at debug level when this build doesn't use TurboSnap, such as when
// `--only-changed` names a branch glob the build's branch doesn't match.
// Globs are matched against real paths, as TurboSnap 2.0 does, so they cover a symlinked config dir.
async function logUntracedStorybookConfig(ctx: TurboSnapV1Input) {
  const untraced = (ctx.options.untraced ?? []).filter(Boolean);
  const { rootPath } = ctx.git;
  if (untraced.length === 0 || !rootPath) {
    return;
  }

  const configDirectory = await realPathOrSelf(ctx.storybook.configDir);
  const storybookDirectory = relativeTo(await realPathOrSelf(rootPath), configDirectory);
  const fileNames = await readdir(configDirectory).catch((): string[] => []);
  const matches = fileNames.flatMap((fileName): UntracedFile[] => {
    const filepath = `${storybookDirectory}/${fileName}`;
    if (!storybookConfigFileKind(filepath, storybookDirectory)) return [];
    const glob = untraced.find((pattern) => matchesFile(pattern, filepath));
    return glob ? [{ filepath, glob }] : [];
  });

  if (matches.length > 0) {
    ctx.log[ctx.turboSnap ? 'warn' : 'debug'](untracedStorybookConfig({ matches }));
  }
}

function missingStatsFileError(ctx: Pick<TurboSnapInput, 'storybook'>) {
  // If we don't know the SB version, we should assume we don't support `--stats-json`
  const nonLegacyStatsSupported =
    ctx.storybook.version && semver.gte(semver.coerce(ctx.storybook.version) || '0.0.0', '8.0.0');

  return new Error(missingStatsFile({ legacy: !nonLegacyStatsSupported }));
}

async function runTurboSnapV2(
  ctx: TurboSnapInput,
  stats: Stats,
  buildId: string
): Promise<HashBasedTurboSnap | undefined> {
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
        buildId,
        stats,
        manifestPath: getManifestPath(ctx.sourceDir),
        projectRoot: ctx.storybook.projectRoot,
        gitRoot: ctx.git.rootPath,
        untraced: ctx.options.untraced ?? [],
        configDir: ctx.storybook.configDir,
        e2ePackage: getE2EPackage(ctx.options),
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
