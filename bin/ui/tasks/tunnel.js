import { baseStorybookUrl } from '../../lib/utils';

export const initial = {
  status: 'initial',
  title: 'Create tunnel',
};

export const pending = ctx => ({
  status: 'pending',
  title: 'Opening tunnel to Chromatic capture servers',
  output: `Connecting to ${ctx.env.CHROMATIC_TUNNEL_URL}`,
});

export const success = ctx => ({
  status: 'success',
  title: `Opened tunnel to Chromatic capture servers`,
  output: `Connected to ${baseStorybookUrl(ctx.cachedUrl || ctx.isolatorUrl)}`,
});

export const failed = ctx => ({
  status: 'error',
  title: 'Opening tunnel to Chromatic capture servers',
  output: `Could not reach ${baseStorybookUrl(ctx.cachedUrl || ctx.isolatorUrl)}`,
});
