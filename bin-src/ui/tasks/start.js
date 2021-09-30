import { getDuration } from '../../lib/tasks';
import { baseStorybookUrl } from '../../lib/utils';

export const initial = {
  status: 'initial',
  title: 'Start Storybook',
};

export const pending = (ctx) => ({
  status: 'pending',
  title: 'Starting your Storybook',
  output: `Running '${ctx.options.scriptName || ctx.options.commandName}'`,
});

export const success = (ctx) => ({
  status: 'success',
  title: `Storybook started in ${getDuration(ctx)}`,
  output: `Running at ${baseStorybookUrl(ctx.isolatorUrl)}`,
});

export const skipped = (ctx) => ({
  status: 'skipped',
  title: 'Start Storybook [skipped]',
  output: ctx.options.noStart
    ? `Skipped due to ${
        ctx.options.storybookUrl ? '--storybook-url' : '--do-not-start'
      }; using ${baseStorybookUrl(ctx.isolatorUrl)}`
    : `Storybook already running at ${baseStorybookUrl(ctx.isolatorUrl)}`,
});

export const skipFailed = (ctx) => ({
  status: 'error',
  title: 'Start Storybook [skipped]',
  output: `No server responding at ${baseStorybookUrl(
    ctx.options.url
  )} -- make sure you've started it`,
});
