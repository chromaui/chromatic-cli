import { createTask, transitionTo } from '../lib/tasks';
import { Context } from '../types';
import invalidProjectId from '../ui/messages/errors/invalidProjectId';
import invalidProjectToken from '../ui/messages/errors/invalidProjectToken';
import { authenticated, authenticating, initial } from '../ui/tasks/auth';

const CreateCLITokenMutation = `
  mutation CreateCLITokenMutation($projectId: String!) {
    cliToken: createCLIToken(projectId: $projectId)
  }
`;

// Legacy mutation
const CreateAppTokenMutation = `
  mutation CreateAppTokenMutation($projectToken: String!) {
    appToken: createAppToken(code: $projectToken)
  }
`;

const getToken = async (ctx: Context) => {
  const { projectId, projectToken, userToken } = ctx.options;

  if (projectId && userToken) {
    const { cliToken } = await ctx.client.runQuery<{ cliToken: string }>(
      CreateCLITokenMutation,
      { projectId },
      {
        endpoint: `${ctx.env.CHROMATIC_INDEX_URL}/api`,
        headers: { Authorization: `Bearer ${userToken}` },
      }
    );
    return cliToken;
  }

  if (projectToken) {
    const { appToken } = await ctx.client.runQuery<{ appToken: string }>(CreateAppTokenMutation, {
      projectToken,
    });
    return appToken;
  }

  // Should never happen since we check for this in getOptions
  throw new Error('No projectId or projectToken');
};

export const setAuthorizationToken = async (ctx: Context) => {
  try {
    const token = await getToken(ctx);
    ctx.client.setAuthorization(token);
  } catch (errors) {
    const message = errors[0]?.message;
    if (message?.match('Must login') || message?.match('No Access')) {
      throw new Error(invalidProjectId({ projectId: ctx.options.projectId }));
    }
    if (message?.match('No app with code')) {
      throw new Error(invalidProjectToken({ projectToken: ctx.options.projectToken }));
    }
    throw errors;
  }
};

export default createTask({
  name: 'auth',
  title: initial.title,
  steps: [transitionTo(authenticating), setAuthorizationToken, transitionTo(authenticated, true)],
});
