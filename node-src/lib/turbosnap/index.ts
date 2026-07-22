import path from 'path';
import semver from 'semver';

import { Context } from '../../types';
import missingStatsFile from '../../ui/messages/errors/missingStatsFile';
import { TraceChangedFilesResult } from './types';
import { traceChangedFiles as traceChangedFilesV1 } from './v1';
import { traceChangedFiles as traceChangedFilesV2 } from './v2';

/**
 * Determines which story files are affected by the changed git files, bailing out of TurboSnap
 * when necessary.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns The TurboSnap result.
 */
// TODO: Refactor this function
// eslint-disable-next-line complexity
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

  try {
    // Anchor at the Storybook base directory when we know it. Without a base directory (e.g. a
    // non-monorepo where Storybook lives at `<repo>/.storybook`), fall back to the repo root, and
    // only to the current working directory when even the repo root is unknown.
    const projectRoot = ctx.git.rootPath
      ? path.resolve(ctx.git.rootPath, ctx.storybook?.baseDir ?? '.')
      : process.cwd();

    const result = await traceChangedFilesV2({
      graphqlClient: ctx.client,
      buildId: ctx.build.id,
      statsPath: ctx.fileInfo.statsPath,
      manifestOutputDirectory: path.join(ctx.sourceDir, '.chromatic'),
      projectRoot,
    });

    if (result.status !== 'fallback') {
      return result;
    }
  } catch (error) {
    ctx.log.error('Error running TurboSnap v2, falling back to v1:', error);
  }

  return await traceChangedFilesV1(ctx);
}
