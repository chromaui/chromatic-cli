import { createTask, transitionTo } from '../../lib/tasks';
import { Context } from '../../types';
import { endActivity, startActivity } from '../../ui/components/activity';
import { dryRun, initial, pending } from '../../ui/tasks/verify';
import { publishBuild } from './publishBuild';
import { verifyBuild } from './verifyBuild';

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
    steps: [transitionTo(pending), startActivity, publishBuild, verifyBuild, endActivity],
  });
}
