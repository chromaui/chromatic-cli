import { baseStorybookUrl } from '../../lib/utils';
import { Context } from '../../types';

export const initial = {
  status: 'initial',
  title: 'Create tunnel',
};

export const pending = (ctx: Context) => ({
  status: 'pending',
  title: 'Opening tunnel to Chromatic capture servers',
  output: `Connecting to ${ctx.env.CHROMATIC_TUNNEL_URL}`,
});

export const success = (ctx: Context) => ({
  status: 'success',
  title: `Opened tunnel to Chromatic capture servers`,
  output: `Connected to ${baseStorybookUrl(ctx.cachedUrl || ctx.isolatorUrl)}`,
});

export const failed = (ctx: Context) => ({
  status: 'error',
  title: 'Opening tunnel to Chromatic capture servers',
  output: `Could not reach ${baseStorybookUrl(ctx.cachedUrl || ctx.isolatorUrl)}`,
});
