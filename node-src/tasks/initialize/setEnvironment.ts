import { Context } from '../../types';

type GatherEnvironmentDeps = Pick<Context, 'env' | 'log'>;

export const setEnvironment = (deps: GatherEnvironmentDeps): Record<string, string> => {
  const environment = {};

  // We send up all environment variables provided by these complicated systems.
  // We don't want to send up *all* environment vars as they could include sensitive information
  // about the user's build environment
  for (const [key, value] of Object.entries(process.env)) {
    if (!value) continue;

    if (deps.env.ENVIRONMENT_WHITELIST.some((regex) => key.match(regex))) {
      environment[key] = value;
    }
  }

  deps.log.debug(`Got environment:\n${JSON.stringify(environment, undefined, 2)}`);

  return environment;
};
