import { getDuration } from '../../lib/tasks';
import { baseStorybookUrl } from '../../lib/utils';
import { Context } from '../../types';

export const initial = {
  status: 'initial',
  title: 'Start Storybook',
};

export const pending = (ctx: Context) => ({
  status: 'pending',
  title: 'Starting your Storybook',
  output: `Running '${ctx.options.scriptName}'`,
});

export const success = (ctx: Context) => ({
  status: 'success',
  title: `Storybook started in ${getDuration(ctx)}`,
  output: `Running at ${baseStorybookUrl(ctx.isolatorUrl)}`,
});

export const skipped = (ctx: Context) => ({
  status: 'skipped',
  title: 'Start Storybook [skipped]',
  output: ctx.options.noStart
    ? `Skipped due to ${
        ctx.options.storybookUrl ? '--storybook-url' : '--do-not-start'
      }; using ${baseStorybookUrl(ctx.isolatorUrl)}`
    : `Storybook already running at ${baseStorybookUrl(ctx.isolatorUrl)}`,
});

export const skipFailed = (ctx: Context) => ({
  status: 'error',
  title: 'Start Storybook [skipped]',
  output: `No server responding at ${baseStorybookUrl(
    ctx.options.url
  )} -- make sure you've started it`,
});
