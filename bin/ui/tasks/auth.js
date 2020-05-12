export const initial = {
  status: 'initial',
  title: 'Authenticate',
};

export const authenticating = ctx => ({
  status: 'pending',
  title: 'Authenticating with Chromatic',
  output: `Connecting to ${ctx.options.indexUrl}`,
});

export const authenticated = ctx => ({
  status: 'success',
  title: 'Authenticated with Chromatic',
  output: `Using project token '${ctx.options.projectToken}'`,
});

export const invalidToken = ctx => ({
  status: 'error',
  title: 'Failed to authenticate',
  output: `Invalid project token '${ctx.options.projectToken}'`,
});
