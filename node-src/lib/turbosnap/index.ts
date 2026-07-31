import path from 'path';
import semver from 'semver';

import { Context } from '../../types';
import missingStatsFile from '../../ui/messages/errors/missingStatsFile';
import { TraceChangedFilesResult } from './types';
import { traceChangedFiles as traceChangedFilesV1 } from './v1';
import { traceChangedFiles as traceChangedFilesV2 } from './v2';

/**
 * Runs both TurboSnap algorithms for monitoring while keeping V1 authoritative.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns Both ordinary algorithm results when V2 produced one.
 */
// TODO: Refactor this function
// eslint-disable-next-line complexity
export async function compareChangedFiles(
  ctx: Context
): Promise<{ v1: TraceChangedFilesResult; v2?: TraceChangedFilesResult }> {
  if (!ctx.turboSnap) {
    const skipped = { status: 'skipped' as const };
    return { v1: skipped, v2: skipped };
  }
  if (ctx.turboSnap.unavailable) {
    const unavailable = { status: 'skipped' as const, turboSnap: ctx.turboSnap };
    return { v1: unavailable, v2: unavailable };
  }
  if (!ctx.git.changedFiles) {
    const shared = ctx.turboSnap.bailReason
      ? ({ status: 'bailed', turboSnap: ctx.turboSnap } as const)
      : ({ status: 'skipped' } as const);
    return { v1: shared, v2: shared };
  }
  if (!ctx.fileInfo?.statsPath) {
    // If we don't know the SB version, we should assume we don't support `--stats-json`
    const nonLegacyStatsSupported =
      ctx.storybook?.version &&
      semver.gte(semver.coerce(ctx.storybook.version) || '0.0.0', '8.0.0');

    throw new Error(missingStatsFile({ legacy: !nonLegacyStatsSupported }));
  }

  let v2: TraceChangedFilesResult | undefined;
  // Anchor at the Storybook base directory when we know it. Without a base directory (e.g. a
  // non-monorepo where Storybook lives at `<repo>/.storybook`), fall back to the repo root, and
  // only to the current working directory when even the repo root is unknown.
  const projectRoot = ctx.git.rootPath
    ? path.resolve(ctx.git.rootPath, ctx.storybook?.baseDir ?? '.')
    : process.cwd();
  const result = await traceChangedFilesV2({
    graphqlClient: ctx.client,
    // Hashes always describe the build we are making, so they are always written to the head build.
    // Whether they can decide anything is the Index's call: it compares them against the baseline's
    // hashes, and with no baseline everything reads as changed.
    buildId: ctx.announcedBuild.id,
    statsPath: ctx.fileInfo.statsPath,
    manifestOutputDirectory: path.join(ctx.sourceDir, '.chromatic'),
    projectRoot,
    // The config and static directories are project-relative, matching how v1 reads them. An
    // explicit --storybook-config-dir wins over the discovered one, as it does in v1.
    configDir: ctx.options?.storybookConfigDir ?? ctx.storybook?.configDir ?? '.storybook',
    staticDirs: ctx.storybook?.staticDir ?? [],
    staticDirsDeclared: ctx.storybook?.staticDirsDeclared ?? false,
    // Read from the project's own Storybook config rather than from `projectRoot`, which is what
    // makes it independent evidence about which package the stats should describe.
    builderName: ctx.storybook?.builder?.name,
  });

  if (result.status === 'bailed') {
    ctx.log.info('TurboSnap v2 bailed; running TurboSnap v1');
  } else if (result.status === 'fallback') {
    ctx.log.info('TurboSnap v2 could not produce a result; running TurboSnap v1');
  } else {
    v2 = result;
  }
  if (result.status === 'bailed') v2 = result;

  const v1 = await traceChangedFilesV1(ctx);
  return { v1, ...(v2 && { v2 }) };
}

/** Returns the V1 result that remains authoritative while V2 runs in monitoring mode. */
export async function traceChangedFiles(ctx: Context): Promise<TraceChangedFilesResult> {
  const { v1 } = await compareChangedFiles(ctx);
  return v1.status === 'skipped' ? { status: 'skipped' } : v1;
}
