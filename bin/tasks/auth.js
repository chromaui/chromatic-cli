import { createTask, transitionTo } from '../lib/tasks';
import invalidProjectToken from '../ui/messages/errors/invalidProjectToken';
import { authenticated, authenticating, initial } from '../ui/tasks/auth';

const TesterCreateAppTokenMutation = `
  mutation TesterCreateAppTokenMutation($projectToken: String!) {
    createAppToken(code: $projectToken)
  }
`;

export const setAuthorizationToken = async ctx => {
  const { client, options } = ctx;
  const variables = { projectToken: options.projectToken };

  try {
    const { createAppToken } = await client.runQuery(TesterCreateAppTokenMutation, variables);
    client.setAuthorization(createAppToken);
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
