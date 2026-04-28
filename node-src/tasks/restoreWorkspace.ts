import { createTask, transitionTo } from '../lib/tasks';
import { runRestoreWorkspacePhase } from '../run/phases/workspace';
import { Context } from '../types';
import { initial, pending, success } from '../ui/tasks/restoreWorkspace';

export const runRestoreWorkspace = async (ctx: Context) => {
  await runRestoreWorkspacePhase({ log: ctx.log, ports: ctx.ports });
};

export default createTask({
  name: 'restoreWorkspace',
  title: initial.title,
  steps: [transitionTo(pending), runRestoreWorkspace, transitionTo(success, true)],
});
