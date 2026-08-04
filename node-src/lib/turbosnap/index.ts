import path from 'path';
import semver from 'semver';

import { readStatsFile } from '../../tasks/readStatsFile';
import { Context, Stats } from '../../types';
import missingStatsFile from '../../ui/messages/errors/missingStatsFile';
import { TraceChangedFilesResult } from './types';
import { traceChangedFiles as traceChangedFilesV1 } from './v1';
import { traceChangedFiles as traceChangedFilesV2 } from './v2';

/**
 * Determines which story files are affected by the changed git files, bailing out of TurboSnap
 * when necessary.
 *
 * V2 runs first, but only for monitoring: it writes the manifest and uploads the story hashes to
 * the Index. Nothing reads its result, and nothing it does — including a failure — is allowed to
 * affect V1, which remains authoritative.
 *
 * The stats file is read here rather than in each algorithm, because both trace the same one and it
 * is the largest artifact in the build.
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

  const statsPath = ctx.fileInfo.statsPath;
  const stats = await readStatsFile(statsPath);

  await traceChangedFilesV2(getV2Input(ctx, stats, statsPath)).catch(() => {});

  return traceChangedFilesV1(ctx, stats, statsPath);
}

/**
 * Derives the v2 input from the CLI context.
 *
 * `ctx.storybook` is typed as always present but is absent in practice before the Storybook info
 * task has run, so it is read defensively here.
 *
 * @param ctx The context set when executing the CLI.
 * @param stats The preview stats file, read by the caller.
 * @param statsPath The path to the stats file, resolved by the caller.
 *
 * @returns The input to run TurboSnap 2.0.
 */
function getV2Input(ctx: Context, stats: Stats, statsPath: string) {
  const storybook: Partial<Context['storybook']> = ctx.storybook ?? {};
  const projectRoot = getProjectRoot(ctx, storybook.baseDir);

  return {
    graphqlClient: ctx.client,
    // Hashes always describe the build we are making, so they are always written to the head build.
    // Whether they can decide anything is the Index's call: it compares them against the baseline's
    // hashes, and with no baseline everything reads as changed.
    buildId: ctx.announcedBuild.id,
    stats,
    statsPath,
    manifestOutputDirectory: path.join(ctx.sourceDir, '.chromatic'),
    repositoryRoot: ctx.git.rootPath ? path.resolve(ctx.git.rootPath) : projectRoot,
    projectRoot,
    // The config and static directories are project-relative, matching how v1 reads them. An
    // explicit --storybook-config-dir wins over the discovered one, as it does in v1.
    configDir: ctx.options?.storybookConfigDir ?? storybook.configDir ?? '.storybook',
    staticDirs: storybook.staticDir ?? [],
    staticDirsDeclared: storybook.staticDirsDeclared ?? false,
    // Read from the project's own Storybook config rather than from `projectRoot`, which is what
    // makes it independent evidence about which package the stats should describe.
    builderName: storybook.builder?.name,
  };
}

/**
 * Anchors the manifest at the Storybook base directory when we know it. Without a base directory
 * (e.g. a non-monorepo where Storybook lives at `<repo>/.storybook`), falls back to the repo root,
 * and only to the current working directory when even the repo root is unknown.
 *
 * @param ctx The context set when executing the CLI.
 * @param baseDirectory The Storybook base directory, relative to the repository root.
 *
 * @returns The absolute Storybook project root.
 */
function getProjectRoot(ctx: Context, baseDirectory?: string): string {
  return ctx.git.rootPath ? path.resolve(ctx.git.rootPath, baseDirectory ?? '.') : process.cwd();
}
