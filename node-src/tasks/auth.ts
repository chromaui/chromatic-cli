import { createTask, transitionTo } from '../lib/tasks';
import { Context } from '../types';
import invalidProjectId from '../ui/messages/errors/invalidProjectId';
import invalidProjectToken from '../ui/messages/errors/invalidProjectToken';
import { authenticated, authenticating, initial } from '../ui/tasks/auth';

const getToken = async (ctx: Context) => {
  const { projectId, projectToken, userToken } = ctx.options;

  if (projectId && userToken) {
    return ctx.ports.chromatic.createCliToken({ projectId, userToken });
  }

  if (projectToken) {
    return ctx.ports.chromatic.createAppToken({ projectToken });
  }

  // Should never happen since we check for this in getOptions
  throw new Error('No projectId or projectToken');
};

export const setAuthorizationToken = async (ctx: Context) => {
  try {
    const token = await getToken(ctx);
    ctx.ports.chromatic.setAuthorization(token);
  } catch (errors) {
    const message = errors[0]?.message;
    if (message?.match('Must login') || message?.match('No Access')) {
      throw new Error(invalidProjectId({ projectId: ctx.options.projectId || '' }));
    }
    if (message?.match('No app with code')) {
      throw new Error(invalidProjectToken({ projectToken: ctx.options.projectToken }));
    }
    throw errors;
  }
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
