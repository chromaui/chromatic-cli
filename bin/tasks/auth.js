import { initial, authenticating, authenticated } from '../ui/tasks/auth';
import { createTask, transitionTo } from '../lib/tasks';
import { TesterCreateAppTokenMutation } from '../io/gql-queries';
import invalidProjectToken from '../ui/messages/errors/invalidProjectToken';

const authenticate = async ctx => {
  const { client, options } = ctx;
  const variables = { projectToken: options.projectToken };

  try {
    const { createAppToken } = await client.runQuery(TesterCreateAppTokenMutation, variables);
    client.headers = { ...client.headers, Authorization: `Bearer ${createAppToken}` };
  } catch (errors) {
    if (errors[0] && errors[0].message && errors[0].message.match('No app with code')) {
      throw new Error(invalidProjectToken(variables));
    }
    throw errors;
  }
};

export default createTask({
  title: initial.title,
  steps: [transitionTo(authenticating), authenticate, transitionTo(authenticated, true)],
});
