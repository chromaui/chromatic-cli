import { createTask, transitionTo } from '../lib/tasks';
import { runAuthPhase } from '../run/phases/auth';
import { Context } from '../types';
import { authenticated, authenticating, initial } from '../ui/tasks/auth';

export const setAuthorizationToken = async (ctx: Context) => {
  await runAuthPhase({ options: ctx.options, log: ctx.log, ports: ctx.ports });
};

/**
 * Sets up the Listr task for authenticating with Chromatic.
 *
 * @param _ The context set when executing the CLI.
 *
 * @returns A Listr task.
 */
export default function main(_: Context) {
  return createTask({
    name: 'auth',
    title: initial.title,
    steps: [transitionTo(authenticating), setAuthorizationToken, transitionTo(authenticated, true)],
  });
}
