import { createTask, transitionTo } from '../lib/tasks';
import { Context } from '../types';
import invalidProjectToken from '../ui/messages/errors/invalidProjectToken';
import { authenticated, authenticating, initial } from '../ui/tasks/auth';

const CreateAppTokenMutation = `
  mutation CreateAppTokenMutation($projectToken: String!) {
    createAppToken(code: $projectToken)
  }
`;

const AppQuery = `
  query AppQuery {
    app {
      isOnboarding
    }
  }
`;
interface CreateAppTokenMutationResult {
  createAppToken: string;
}
interface AppQueryResult {
  app: {
    isOnboarding: boolean;
  };
}

export const setAuthorizationToken = async (ctx: Context) => {
  const { client, options } = ctx;
  const variables = { projectToken: options.projectToken };

  try {
    const { createAppToken: appToken } = await client.runQuery<CreateAppTokenMutationResult>(
      CreateAppTokenMutation,
      variables
    );
    client.setAuthorization(appToken);
  } catch (errors) {
    if (errors[0] && errors[0].message && errors[0].message.match('No app with code')) {
      throw new Error(invalidProjectToken(variables));
    }
    throw errors;
  }
};

export const getAppInfo = async (ctx: Context) => {
  const { client, options } = ctx;
  const variables = { code: options.projectToken };

  const { app } = await client.runQuery<AppQueryResult>(AppQuery, variables);
  ctx.isOnboarding = app.isOnboarding;
};

export default createTask({
  title: initial.title,
  steps: [
    transitionTo(authenticating),
    setAuthorizationToken,
    getAppInfo,
    transitionTo(authenticated, true),
  ],
});
