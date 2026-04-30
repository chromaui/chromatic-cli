import { createTask } from '../lib/tasks';
import { Context, Deps, TaskFunction } from '../types';
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

export type AuthDeps = Pick<Deps, 'client' | 'env'>;

export type AuthInput =
  | { mode: 'cli'; projectId: string; userToken: string; projectToken: string }
  | { mode: 'app'; projectToken: string };

const getToken = async (deps: AuthDeps, input: AuthInput): Promise<string> => {
  switch (input.mode) {
    case 'cli': {
      const { cliToken } = await deps.client.runQuery<{ cliToken: string }>(
        CreateCLITokenMutation,
        { projectId: input.projectId },
        {
          endpoint: `${deps.env.CHROMATIC_INDEX_URL}/api`,
          headers: { Authorization: `Bearer ${input.userToken}` },
        }
      );
      return cliToken;
    }
    case 'app': {
      const { appToken } = await deps.client.runQuery<{ appToken: string }>(
        CreateAppTokenMutation,
        {
          projectToken: input.projectToken,
        }
      );
      return appToken;
    }
    default: {
      // Need to ensure input is exhaustive but also return a Promise<string> from the default branch to satisfy function return type
      const _exhaustiveCheck: never = input;
      return _exhaustiveCheck;
    }
  }
};

export const runAuth: TaskFunction<AuthInput, void, AuthDeps> = async (deps, input) => {
  try {
    const token = await getToken(deps, input);
    deps.client.setAuthorization(token);
  } catch (errors) {
    const message = errors[0]?.message;
    if (message?.match('Must login') || message?.match('No Access')) {
      throw new Error(invalidProjectId({ projectId: input.mode === 'cli' ? input.projectId : '' }));
    }
    if (message?.match('No app with code')) {
      throw new Error(invalidProjectToken({ projectToken: input.projectToken }));
    }
    throw errors;
  }
  return { kind: 'continue', output: undefined };
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
    transitions: { pending: authenticating, success: authenticated },
    extractInput: (ctx): AuthInput => {
      const { projectId, projectToken, userToken } = ctx.options;
      if (projectId && userToken) {
        return { mode: 'cli', projectId, userToken, projectToken };
      }
      return { mode: 'app', projectToken };
    },
    run: runAuth,
  });
}
