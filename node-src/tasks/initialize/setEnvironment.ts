import { Context } from '../../types';

export const setEnvironment = async (ctx: Context) => {
  if (!ctx.environment) {
    ctx.environment = {};
  }

  // We send up all environment variables provided by these complicated systems.
  // We don't want to send up *all* environment vars as they could include sensitive information
  // about the user's build environment
  for (const [key, value] of Object.entries(process.env)) {
    if (!value) continue;

    if (ctx.env.ENVIRONMENT_WHITELIST.some((regex) => key.match(regex))) {
      ctx.environment[key] = value;
    }
  }

  ctx.log.debug(`Got environment:\n${JSON.stringify(ctx.environment, undefined, 2)}`);
};
