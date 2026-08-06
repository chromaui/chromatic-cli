import { checkoutPrevious, discardChanges } from '../git/git';
import installDependencies from '../lib/installDependencies';
import { Context } from '../types';
import { pending, success } from '../ui/tasks/restoreWorkspace';

/**
 * Restore the workspace to its original branch after a patch build. Called directly (not through
 * the `runTask`/render pipeline) so it always runs during teardown, even if an upstream task set
 * `ctx.skip` to halt the rest of the pipeline.
 *
 * @param ctx The CLI context.
 */
export const runRestoreWorkspace = async (ctx: Context) => {
  ctx.log.info(pending().output);
  await discardChanges(ctx); // we need a clean state before checkout
  await checkoutPrevious(ctx);
  await installDependencies();
  await discardChanges(ctx); // drop lockfile changes
  ctx.log.info(success().title);
};
