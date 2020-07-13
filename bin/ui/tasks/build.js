import { getDuration } from '../../lib/tasks';

export const initial = {
  status: 'initial',
  title: 'Build Storybook',
};

export const pending = ctx => ({
  status: 'pending',
  title: 'Building your Storybook',
  output: `Running command: ${ctx.spawnParams.scriptArgs.join(' ')}`,
});

export const success = ctx => ({
  status: 'success',
  title: `Storybook built in ${getDuration(ctx)}`,
  output: `View build log at ${ctx.buildLogFile}`,
});

export const skipped = ctx => ({
  status: 'skipped',
  title: 'Build Storybook [skipped]',
  output: `Using prebuilt Storybook at ${ctx.options.storybookBuildDir}`,
});
