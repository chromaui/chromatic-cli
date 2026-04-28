import { setExitCode } from '../lib/setExitCode';
import { createTask, transitionTo } from '../lib/tasks';
import { runSnapshotPhase, SnapshotOutcome } from '../run/phases/snapshot';
import { Context, Task } from '../types';
import {
  buildBroken,
  buildCanceled,
  buildComplete,
  buildFailed,
  buildPassed,
  dryRun,
  initial,
  pending,
  skipped,
} from '../ui/tasks/snapshot';

export const takeSnapshots = async (ctx: Context, task: Task) => {
  const result = await runSnapshotPhase({
    options: ctx.options,
    env: ctx.env,
    git: ctx.git,
    build: ctx.build,
    uploadedBytes: ctx.uploadedBytes,
    log: ctx.log,
    ports: ctx.ports,
    onProgress: ({ output }) => {
      ctx.ports.ui.taskUpdate({ output });
    },
  });

  // Compatibility copy: downstream phases still read these via `ctx.*`.
  ctx.build = result.build;
  setExitCode(ctx, result.exitCodeIntent.exitCode, result.exitCodeIntent.userError);

  transitionTo(transitionFor(result.outcome), true)(ctx, task);
};

function transitionFor(outcome: SnapshotOutcome) {
  switch (outcome) {
    case 'passed':
      return buildPassed;
    case 'has-changes':
      return buildComplete;
    case 'broken':
      return buildBroken;
    case 'failed':
      return buildFailed;
    case 'cancelled':
      return buildCanceled;
    default:
      throw new Error(`Unhandled snapshot outcome: ${outcome as string}`);
  }
}

/**
 * Sets up the Listr task for snapshotting the Storybook.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns A Listr task.
 */
export default function main(ctx: Context) {
  return createTask({
    name: 'snapshot',
    title: initial(ctx).title,
    skip: (ctx: Context) => {
      if (ctx.skip) return true;
      if (ctx.skipSnapshots) return skipped(ctx).output;
      if (ctx.options.dryRun) return dryRun(ctx).output;
      return false;
    },
    steps: [transitionTo(pending), takeSnapshots],
  });
}
