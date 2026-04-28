import { exitCodes, setExitCode } from '../lib/setExitCode';
import { createTask, transitionTo } from '../lib/tasks';
import { runGitInfoPhase } from '../run/phases/gitInfo';
import { Context, Task } from '../types';
import {
  initial,
  pending,
  skippedForCommit,
  skippedRebuild,
  skippingBuild,
  success,
} from '../ui/tasks/gitInfo';

export const setGitInfo = async (ctx: Context, task: Task) => {
  const result = await runGitInfoPhase({
    options: ctx.options,
    packageJson: ctx.packageJson,
    log: ctx.log,
    ports: ctx.ports,
  });

  // Compatibility copy: downstream phases still read these via `ctx.*`.
  ctx.git = result.git as Context['git'];
  ctx.projectMetadata = result.projectMetadata;
  ctx.isOnboarding = result.isOnboarding;
  if (result.optionsOverride?.forceRebuild !== undefined) {
    ctx.options.forceRebuild = result.optionsOverride.forceRebuild;
  }
  if (result.rebuildForBuildId) {
    ctx.rebuildForBuildId = result.rebuildForBuildId;
  }

  switch (result.outcome.kind) {
    case 'skip-commit': {
      transitionTo(skippingBuild)(ctx, task);
      ctx.skip = true;
      transitionTo(skippedForCommit, true)(ctx, task);
      setExitCode(ctx, exitCodes.OK);
      return;
    }
    case 'skip-rebuild': {
      ctx.skip = true;
      ctx.rebuildForBuild = result.outcome.rebuildForBuild;
      ctx.storybookUrl = result.outcome.storybookUrl;
      transitionTo(skippedRebuild, true)(ctx, task);
      setExitCode(ctx, exitCodes.OK);
      return;
    }
    case 'continue': {
      ctx.turboSnap = result.outcome.turboSnap;
      if (result.outcome.build) {
        ctx.build = result.outcome.build;
      }
      transitionTo(success, true)(ctx, task);
      return;
    }
    default: {
      throw new Error(`Unhandled gitInfo outcome: ${(result.outcome as { kind: string }).kind}`);
    }
  }
};

/**
 * Sets up the Listr task for gathering information from Git.
 *
 * @param _ The context set when executing the CLI.
 *
 * @returns A Listr task.
 */
export default function main(_: Context) {
  return createTask({
    name: 'gitInfo',
    title: initial.title,
    steps: [transitionTo(pending), setGitInfo],
  });
}
