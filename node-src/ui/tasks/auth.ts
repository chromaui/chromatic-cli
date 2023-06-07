import { Context } from '../../types';

const mask = (secret: string) => '*'.repeat(secret.length - 4) + secret.slice(-4);

const env = (indexUrl: string) => {
  if (indexUrl.includes('dev')) return ' [dev]';
  if (indexUrl.includes('staging')) return ' [staging]';
  return '';
};

export const initial = {
  status: 'initial',
  title: 'Authenticate',
};

export const authenticating = (ctx: Context) => ({
  status: 'pending',
  title: `Authenticating with Chromatic${env(ctx.env.CHROMATIC_INDEX_URL)}`,
  output: `Connecting to ${ctx.env.CHROMATIC_INDEX_URL}`,
});

export const authenticated = (ctx: Context) => ({
  status: 'success',
  title: `Authenticated with Chromatic${env(ctx.env.CHROMATIC_INDEX_URL)}`,
  output: `Using project token '${mask(ctx.options.projectToken)}'`,
});

export const invalidToken = (ctx: Context) => ({
  status: 'error',
  title: `Failed to authenticate with Chromatic${env(ctx.env.CHROMATIC_INDEX_URL)}`,
  output: `Invalid project token '${ctx.options.projectToken}'`,
});
