import { createTask, transitionTo } from '../lib/tasks';
import { PreparePhaseError, runPreparePhase } from '../run/phases/prepare';
import { Context, Task } from '../types';
import { bailed, initial, success, traced, validating } from '../ui/tasks/prepare';

export const runPrepare = async (ctx: Context, task: Task) => {
  if (ctx.skip) return;
  try {
    const result = await runPreparePhase({
      options: ctx.options,
      env: ctx.env,
      storybook: ctx.storybook,
      isReactNativeApp: ctx.isReactNativeApp,
      browsers: ctx.announcedBuild?.browsers,
      artifacts: {
        sourceDir: ctx.sourceDir,
        buildCommand: ctx.buildCommand,
        buildLogFile: ctx.buildLogFile,
      },
      git: ctx.git,
      turboSnap: ctx.turboSnap,
      packageJson: ctx.packageJson,
      log: ctx.log,
      ports: ctx.ports,
    });

    mirrorOnto(ctx, result);
    handleOutcome(ctx, task, result.outcome.kind);
  } catch (error) {
    if (error instanceof PreparePhaseError && error.turboSnap) {
      ctx.turboSnap = error.turboSnap;
    }
    throw error;
  }
};

function mirrorOnto(ctx: Context, result: Awaited<ReturnType<typeof runPreparePhase>>): void {
  // Compatibility copy: downstream phases still read these via `ctx.*`.
  ctx.sourceDir = result.sourceDir;
  ctx.fileInfo = result.fileInfo;
  if (result.onlyStoryFiles !== undefined) ctx.onlyStoryFiles = result.onlyStoryFiles;
  if (result.untracedFiles !== undefined) ctx.untracedFiles = result.untracedFiles;
  if (result.turboSnap !== undefined) ctx.turboSnap = result.turboSnap;
}

function handleOutcome(
  ctx: Context,
  task: Task,
  kind: 'prepared' | 'turbosnap-traced' | 'turbosnap-bailed'
): void {
  switch (kind) {
    case 'turbosnap-traced': {
      transitionTo(traced)(ctx, task);
      break;
    }
    case 'turbosnap-bailed': {
      transitionTo(bailed)(ctx, task);
      break;
    }
    case 'prepared': {
      break;
    }
    default: {
      throw new Error(`Unhandled prepare outcome: ${kind as string}`);
    }
  }
}

/**
 * Sets up the Listr task for preparing the Storybook for upload.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns A Listr task.
 */
export default function main(ctx: Context) {
  return createTask({
    name: 'prepare',
    title: initial(ctx).title,
    skip: (ctx: Context) => !!ctx.skip,
    steps: [transitionTo(validating), runPrepare, transitionTo(success, true)],
  });
}
