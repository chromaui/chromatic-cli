import { createTask, transitionTo } from '../lib/tasks';
import { Context } from '../types';
import invalidProjectToken from '../ui/messages/errors/invalidProjectToken';
import { authenticated, authenticating, initial } from '../ui/tasks/auth';

const CreateAppTokenMutation = `
  mutation CreateAppTokenMutation($projectToken: String!) {
    createAppToken(code: $projectToken)
  }
`;

interface CreateAppTokenMutationResult {
  createAppToken: string;
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

export default createTask({
  name: 'auth',
  title: initial.title,
  steps: [transitionTo(authenticating), setAuthorizationToken, transitionTo(authenticated, true)],
});
