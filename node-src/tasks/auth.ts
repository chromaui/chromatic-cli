import { createTask } from '../lib/tasks';
import { Context, Deps, TaskFunction } from '../types';
import invalidProjectId from '../ui/messages/errors/invalidProjectId';
import invalidProjectToken from '../ui/messages/errors/invalidProjectToken';
import missingProjectToken from '../ui/messages/errors/missingProjectToken';
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

// Pre-flight query to determine app type before the pipeline reaches storybookInfo.
// This is placed here to avoid adding a new task to the pipeline, which was an accepted
// tradeoff. Ideally this would live in a dedicated appInfo task between auth and
// storybookInfo. The result is a best-effort early signal; announceBuild remains the
// authoritative source for isReactNativeApp.
const AppInfoQuery = `
  query CLIAppInfo {
    app {
      features {
        isReactNativeApp
      }
    }
  }
`;

export type AuthDeps = Pick<Deps, 'client' | 'env' | 'log'>;

export type AuthInput =
  | { mode: 'cli'; projectId: string; userToken: string; projectToken: string }
  | { mode: 'app'; projectToken: string };

export interface AuthOutput {
  isReactNativeApp: boolean;
}

/**
 * Retrieves an authentication token based on the specified mode.
 *
 * In 'cli' mode, creates a CLI token by authenticating with a user token against
 * the Chromatic API, scoped to a specific project.
 *
 * In 'app' mode, creates an app token by authenticating directly with a project token.
 *
 * @param deps - The authentication dependencies, including the GraphQL client and environment config.
 * @param input - The authentication input, which determines the mode and supplies the required credentials.
 *
 * @returns A promise resolving to the authentication token string.
 */
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

/* eslint-disable-next-line complexity */
export const runAuth: TaskFunction<AuthInput, AuthOutput, AuthDeps> = async (deps, input) => {
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

  // Pre-flight: fetch app type so storybookInfo can skip the build-storybook script
  // check for react-native projects. Skip if projectToken is absent (e.g. cli mode
  // without a project token). On any failure, soft-fail and assume a web storybook —
  // announceBuild will make the authoritative determination.
  let isReactNativeApp = false;
  try {
    const { app } = await deps.client.runQuery<{
      app: { features: { isReactNativeApp: boolean } };
    }>(AppInfoQuery, {});
    isReactNativeApp = app?.features?.isReactNativeApp ?? false;
  } catch {
    deps.log.warn('Failed to fetch app info; assuming web storybook for build script check.');
  }

  return { kind: 'continue', output: { isReactNativeApp } };
};

export const applyAuthOutput = (ctx: Context, output: AuthOutput) => {
  ctx.isReactNativeApp = output.isReactNativeApp;
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
      if (!projectToken) {
        throw new Error(missingProjectToken());
      }
      return { mode: 'app', projectToken };
    },
    applyOutput: applyAuthOutput,
    run: runAuth,
  });
}
