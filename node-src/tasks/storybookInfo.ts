import * as Sentry from '@sentry/node';

import getStorybookInfo from '../lib/getStorybookInfo';
import { createTask, transitionTo } from '../lib/tasks';
import { Context } from '../types';
import { initial, pending, success } from '../ui/tasks/storybookInfo';
import { getHasRouter } from '../lib/getHasRouter';

export const setStorybookInfo = async (ctx: Context) => {
  ctx.storybook = (await getStorybookInfo(ctx)) as Context['storybook'];

  if (ctx.storybook) {
    if (ctx.storybook.version) {
      Sentry.setTag('storybookVersion', ctx.storybook.version);
    }
    if (ctx.storybook.viewLayer) {
      Sentry.setTag('storybookViewLayer', ctx.storybook.viewLayer);
    }
    Sentry.setContext('storybook', ctx.storybook);
  }

  // Also get some project-level data for analytics
  ctx.projectMetadata = {
    hasRouter: getHasRouter(ctx.packageJson),
  };
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
