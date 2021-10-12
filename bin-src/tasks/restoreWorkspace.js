import { checkoutPrevious, discardChanges } from '../git/git';
import installDependencies from '../lib/installDependencies';
import { createTask, transitionTo } from '../lib/tasks';
import { initial, pending, success } from '../ui/tasks/restoreWorkspace';

export const runRestoreWorkspace = async () => {
  await discardChanges(); // we need a clean state before checkout
  await checkoutPrevious();
  await installDependencies();
  await discardChanges(); // drop lockfile changes
};

export default createTask({
  title: initial.title,
  steps: [transitionTo(pending), runRestoreWorkspace, transitionTo(success, true)],
});
