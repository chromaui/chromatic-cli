import { checkoutPrevious, discardChanges } from '../git/git';
import installDependencies from '../lib/installDependencies';
import { createTask, transitionTo } from '../lib/tasks';
import { Context } from '../types';
import { initial, pending, success } from '../ui/tasks/restoreWorkspace';

export const runRestoreWorkspace = async (ctx: Context) => {
  await discardChanges(ctx); // we need a clean state before checkout
  await checkoutPrevious(ctx);
  await installDependencies();
  await discardChanges(ctx); // drop lockfile changes
};

export default createTask({
  name: 'restoreWorkspace',
  title: initial.title,
  steps: [transitionTo(pending), runRestoreWorkspace, transitionTo(success, true)],
});
