import { createTask, transitionTo } from '../lib/tasks';
import { runStorybookInfoPhase } from '../run/phases/storybookInfo';
import { Context } from '../types';
import { initial, pending, success } from '../ui/tasks/storybookInfo';

export const setStorybookInfo = async (ctx: Context) => {
  ctx.storybook = await runStorybookInfoPhase({
    options: ctx.options,
    git: ctx.git,
    log: ctx.log,
    ports: ctx.ports,
  });
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
