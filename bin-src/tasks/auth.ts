import { createTask, transitionTo } from '../lib/tasks';
import { Context } from '../types';
import invalidProjectToken from '../ui/messages/errors/invalidProjectToken';
import { authenticated, authenticating, initial } from '../ui/tasks/auth';

const CreateAppTokenMutation = `
  mutation CreateAppTokenMutation($projectToken: String!) {
    createAppToken(code: $projectToken)
  }
`;

const AppByCodeQuery = `
  query AppyByCodeQuery($code: String!) {
    appByCode(code: $code) {
      isOnboarding
    }
  }
`;
interface CreateAppTokenMutationResult {
  createAppToken: string;
}
interface AppyByCodeQueryResult {
  appByCode: {
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
    const { appByCode: app } = await ctx.client.runQuery<AppyByCodeQueryResult>(AppByCodeQuery, {
      code: ctx.options.projectToken,
    });
    ctx.isOnboarding = app.isOnboarding;
  } catch (errors) {
    if (errors[0] && errors[0].message && errors[0].message.match('No app with code')) {
      throw new Error(invalidProjectToken(variables));
    }
    throw errors;
  }
};

export default createTask({
  title: initial.title,
  steps: [transitionTo(authenticating), setAuthorizationToken, transitionTo(authenticated, true)],
});
