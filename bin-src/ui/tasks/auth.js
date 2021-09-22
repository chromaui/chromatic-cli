const mask = (secret) => '*'.repeat(secret.length - 4) + secret.substr(-4);

const env = (indexUrl) => {
  if (indexUrl.includes('dev')) return ' [dev]';
  if (indexUrl.includes('staging')) return ' [staging]';
  return '';
};

export const initial = {
  status: 'initial',
  title: 'Authenticate',
};

export const authenticating = (ctx) => ({
  status: 'pending',
  title: `Authenticating with Chromatic${env(ctx.env.CHROMATIC_INDEX_URL)}`,
  output: `Connecting to ${ctx.env.CHROMATIC_INDEX_URL}`,
});

export const authenticated = (ctx) => ({
  status: 'success',
  title: `Authenticated with Chromatic${env(ctx.env.CHROMATIC_INDEX_URL)}`,
  output: `Using project token '${mask(ctx.options.projectToken)}'`,
});

export const invalidToken = (ctx) => ({
  status: 'error',
  title: `Failed to authenticate with Chromatic${env(ctx.env.CHROMATIC_INDEX_URL)}`,
  output: `Invalid project token '${ctx.options.projectToken}'`,
});
