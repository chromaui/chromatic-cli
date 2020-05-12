import { getDuration } from '../../lib/tasks';
import { baseStorybookUrl, progress as progressBar } from '../../lib/utils';

export const initial = {
  status: 'initial',
  title: 'Upload your built Storybook',
};

export const preparing = ctx => ({
  status: 'pending',
  title: 'Uploading your built Storybook',
  output: `Retrieving target location`,
});

export const starting = ctx => ({
  status: 'pending',
  title: 'Uploading your built Storybook',
  output: `Starting upload`,
});

export const uploading = ctx => ({
  status: 'pending',
  title: 'Uploading your built Storybook',
  output: `[${progressBar(ctx.percentage)}] ${ctx.percentage}%`,
});

export const success = ctx => ({
  status: 'success',
  title: `Upload complete in ${getDuration(ctx)}`,
  output: `View your Storybook at ${baseStorybookUrl(ctx.isolatorUrl)}`,
});

export const skipped = ctx => ({
  status: 'skipped',
  title: 'Upload your built Storybook [skipped]',
  output: `Using hosted Storybook at ${ctx.options.storybookUrl}`,
});

export const failed = ctx => ({
  status: 'error',
  title: 'Uploading your built Storybook',
  output: `Failed to upload ${ctx.path}`,
});
