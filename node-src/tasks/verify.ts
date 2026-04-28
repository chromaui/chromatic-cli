import { setExitCode } from '../lib/setExitCode';
import { createTask, transitionTo } from '../lib/tasks';
import { runVerifyPhase, VerifyPhaseError } from '../run/phases/verify';
import { Context, Task } from '../types';
import { endActivity, startActivity } from '../ui/components/activity';
import { dryRun, initial, pending, success } from '../ui/tasks/verify';

export const verify = async (ctx: Context, task: Task) => {
  if (ctx.skip) return;
  try {
    const result = await runVerifyPhase({
      options: ctx.options,
      env: ctx.env,
      git: ctx.git,
      storybook: ctx.storybook,
      announcedBuild: ctx.announcedBuild,
      turboSnap: ctx.turboSnap,
      onlyStoryFiles: ctx.onlyStoryFiles,
      log: ctx.log,
      ports: ctx.ports,
    });

    // Compatibility copy: downstream phases still read these via `ctx.*`.
    ctx.announcedBuild = result.announcedBuild;
    ctx.build = result.build;
    ctx.storybookUrl = result.storybookUrl;
    ctx.isPublishOnly = result.isPublishOnly;
    if (result.skipSnapshots) ctx.skipSnapshots = true;
    if (result.exitCodeIntent) {
      setExitCode(ctx, result.exitCodeIntent.exitCode, result.exitCodeIntent.userError);
    }

    transitionTo(success, true)(ctx, task);
  } catch (error) {
    if (error instanceof VerifyPhaseError) {
      setExitCode(ctx, error.exitCode, error.userError);
    }
    throw error;
  }
};

/**
 * Sets up the Listr task for verifying the uploaded Storybook.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns A Listr task.
 */
export default function main(ctx: Context) {
  return createTask({
    name: 'verify',
    title: initial(ctx).title,
    skip: (ctx: Context) => {
      if (ctx.skip) return true;
      if (ctx.options.dryRun) return dryRun(ctx).output;
      return false;
    },
    steps: [transitionTo(pending), startActivity, verify, endActivity],
  });
}
