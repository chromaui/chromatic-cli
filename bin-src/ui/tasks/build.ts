import { getDuration } from '../../lib/tasks';
import { Context } from '../../types';

const fullCommand = ({ command, clientArgs, scriptArgs }: Context['spawnParams']) =>
  [command, ...clientArgs, ...scriptArgs].join(' ');

export const initial = {
  status: 'initial',
  title: 'Build Storybook',
};

export const pending = (ctx: Context) => ({
  status: 'pending',
  title: `Building your Storybook`,
  output: `Running command: ${fullCommand(ctx.spawnParams)}`,
});

export const success = (ctx: Context) => ({
  status: 'success',
  title: `Storybook built in ${getDuration(ctx)}`,
  output: `View build log at ${ctx.buildLogFile}`,
});

export const skipped = (ctx: Context) => ({
  status: 'skipped',
  title: 'Build Storybook [skipped]',
  output: `Using prebuilt Storybook at ${ctx.options.storybookBuildDir}`,
});

export const failed = (ctx: Context) => ({
  status: 'error',
  title: `Building your Storybook`,
  output: `Command failed: ${fullCommand(ctx.spawnParams)}`,
});
