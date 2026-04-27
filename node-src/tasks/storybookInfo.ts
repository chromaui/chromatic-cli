import { getStorybookBaseDirectory } from '../lib/getStorybookBaseDirectory';
import { createTask, transitionTo } from '../lib/tasks';
import { Context } from '../types';
import { initial, pending, success } from '../ui/tasks/storybookInfo';

export const setStorybookInfo = async (ctx: Context) => {
  ctx.storybook = {
    ...((await ctx.ports.storybook.detect(ctx)) as Context['storybook']),
    baseDir: getStorybookBaseDirectory(ctx),
  };

  if (ctx.storybook) {
    if (ctx.storybook.version) {
      ctx.ports.errors.setTag('storybookVersion', ctx.storybook.version);
    }
    ctx.ports.errors.setContext('storybook', ctx.storybook);
  }
};

/**
 * Sets up the Listr task for gathering Storybook information.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns A Listr task.
 */
export default function main(ctx: Context) {
  return createTask({
    name: 'storybookInfo',
    title: initial(ctx).title,
    skip: (ctx: Context) => ctx.skip,
    steps: [transitionTo(pending), setStorybookInfo, transitionTo(success, true)],
  });
}
