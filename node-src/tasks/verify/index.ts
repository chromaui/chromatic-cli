import { exitCodes, setExitCode } from '../../lib/setExitCode';
import { Context, Deps, TaskResult } from '../../types';
import { publishBuild } from './publishBuild';
import { verifyBuild } from './verifyBuild';

export interface VerifyInput {
  announcedBuild: Context['announcedBuild'];
  build: Context['build'];
  replacementBuildIds?: Context['git']['replacementBuildIds'];
  options: Context['options'];
  onlyStoryFiles?: string[];
  matchesBranch?: Context['git']['matchesBranch'];
  turboSnap?: Context['turboSnap'];
  isReactNativeApp?: boolean;
}

export interface VerifyOutput {
  announcedBuild: Context['announcedBuild'];
  storybookUrl: string;
  build: Context['build'];
  // TECHDEBT: if we add a third flag here, we should refactor to something more extensible
  isPublishOnly: boolean;
  skipSnapshots: boolean;
  limitExitCode?: { code: number; userError: boolean };
}

/**
 * Publish the uploaded build and wait for Chromatic to verify it has started, surfacing build
 * metadata (component/spec counts, TurboSnap status, limits) for the snapshot task that follows.
 *
 * @param deps Narrow set of cross-cutting dependencies the task needs.
 * @param input Per-pipeline-run input extracted from Context at the seam.
 *
 * @returns A TaskResult conveying the verified build, or a self-skip for `--dry-run`.
 */
export async function verifyProject(
  deps: Deps,
  input: VerifyInput
): Promise<TaskResult<VerifyOutput>> {
  if (deps.options.dryRun) {
    return { kind: 'skip-self' };
  }

  const { announcedBuild, storybookUrl } = await publishBuild(deps, {
    announcedBuild: input.announcedBuild,
    options: input.options,
    replacementBuildIds: input.replacementBuildIds,
    onlyStoryFiles: input.onlyStoryFiles,
    turboSnap: input.turboSnap,
  });

  const { build, isPublishOnly, skipSnapshots, limitExitCode } = await verifyBuild(deps, {
    announcedBuild,
    build: input.build,
    storybookUrl,
    options: input.options,
    onlyStoryFiles: input.onlyStoryFiles,
    matchesBranch: input.matchesBranch,
    turboSnap: input.turboSnap,
    isReactNativeApp: input.isReactNativeApp,
  });

  return {
    kind: 'continue',
    output: { announcedBuild, storybookUrl, build, isPublishOnly, skipSnapshots, limitExitCode },
  };
}

export const extractVerifyInput = (ctx: Context): VerifyInput => ({
  announcedBuild: ctx.announcedBuild,
  build: ctx.build,
  replacementBuildIds: ctx.git.replacementBuildIds,
  options: ctx.options,
  onlyStoryFiles: ctx.onlyStoryFiles,
  matchesBranch: ctx.git.matchesBranch,
  turboSnap: ctx.turboSnap,
  isReactNativeApp: ctx.isReactNativeApp,
});

export const applyVerifyOutput = (ctx: Context, output: VerifyOutput) => {
  ctx.announcedBuild = output.announcedBuild;
  ctx.storybookUrl = output.storybookUrl;
  ctx.build = output.build;
  ctx.isPublishOnly = output.isPublishOnly;

  // Ordering on the setExitCode calls matters: a limit code first, then OK overrides it when the
  // build is publish-only / listed / exiting once uploaded. If we add a third case, refactor.
  if (output.limitExitCode) {
    setExitCode(ctx, output.limitExitCode.code, output.limitExitCode.userError);
  }
  if (output.skipSnapshots) {
    setExitCode(ctx, exitCodes.OK);
    ctx.skipSnapshots = true;
  }
};
