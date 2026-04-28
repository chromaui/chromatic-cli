import { setExitCode } from '../lib/setExitCode';
import { createTask, transitionTo } from '../lib/tasks';
import {
  PrepareWorkspaceStage,
  runPrepareWorkspacePhase,
  WorkspacePhaseError,
} from '../run/phases/workspace';
import { Context, Task } from '../types';
import {
  checkoutMergeBase,
  initial,
  installingDependencies,
  lookupMergeBase,
  pending,
  success,
} from '../ui/tasks/prepareWorkspace';

export const runPrepareWorkspace = async (ctx: Context, task: Task) => {
  try {
    const result = await runPrepareWorkspacePhase({
      options: ctx.options,
      log: ctx.log,
      ports: ctx.ports,
      onStage: (stage) => transitionTo(transitionFor(stage))(ctx, task),
    });
    ctx.mergeBase = result.mergeBase;
  } catch (error) {
    if (error instanceof WorkspacePhaseError) {
      ctx.mergeBase = undefined;
      setExitCode(ctx, error.exitCode, error.userError);
    }
    throw error;
  }
};

function transitionFor(stage: PrepareWorkspaceStage) {
  switch (stage) {
    case 'lookup-merge-base':
      return lookupMergeBase;
    case 'checkout-merge-base':
      return checkoutMergeBase;
    case 'installing':
      return installingDependencies;
    default:
      throw new Error(`Unhandled prepareWorkspace stage: ${stage as string}`);
  }
}

export default createTask({
  name: 'prepareWorkspace',
  title: initial.title,
  steps: [transitionTo(pending), runPrepareWorkspace, transitionTo(success, true)],
});
