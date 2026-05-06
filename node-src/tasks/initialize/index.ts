import { createAnalyticsClient } from '@cli/analytics';
import { createTask, transitionTo } from '@cli/tasks';

import { Context } from '../../types';
import { initial, pending, success } from '../../ui/tasks/initialize';
import { announceBuild } from './announceBuild';
import { gatherEnvironment } from './gatherEnvironment';
import { getRuntimeMetadata } from './getRuntimeMetadata';

/**
 * Creates the analytics client and attaches it to the context.
 *
 * @param ctx The context set when executing the CLI.
 */
export const initializeAnalytics = async (ctx: Context) => {
  ctx.analytics = createAnalyticsClient(ctx);
};

/**
 * Sets up the Listr task for announcing a new build on Chromatic.
 *
 * @param _ The context set when executing the CLI.
 *
 * @returns A Listr task.
 */
export default function main(_: Context) {
  return createTask({
    name: 'initialize',
    title: initial.title,
    skip: (ctx: Context) => ctx.skip,
    steps: [
      transitionTo(pending),
      gatherEnvironment,
      getRuntimeMetadata,
      initializeAnalytics,
      announceBuild,
      transitionTo(success, true),
    ],
  });
}
