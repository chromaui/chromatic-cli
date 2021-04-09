import { getDuration } from '../../lib/tasks';
import { baseStorybookUrl, progress as progressBar } from '../../lib/utils';

export const initial = {
  status: 'initial',
  title: 'Publish your built Storybook',
};

export const skipped = (ctx) => ({
  status: 'skipped',
  title: 'Publish your built Storybook [skipped]',
  output: `Using hosted Storybook at ${ctx.options.storybookUrl}`,
});

export const validating = (ctx) => ({
  status: 'pending',
  title: 'Publish your built Storybook',
  output: `Validating Storybook files`,
});

export const invalid = (ctx, error) => {
  let output = `Invalid Storybook build at ${ctx.sourceDir}`;
  if (ctx.buildLogFile) output += ' (check the build log)';
  if (error) output += `: ${error.message}`;
  return {
    status: 'error',
    title: 'Publishing your built Storybook',
    output,
  };
};

export const tracing = (ctx) => ({
  status: 'pending',
  title: 'Retrieving story files affected by recent changes',
  output: `Traversing dependencies for ${ctx.git.changedFiles.length} files that changed since the last build`,
});

export const skippingBuild = (ctx) => ({
  status: 'pending',
  title: 'Skipping build',
  output: `Skipping build because no story files were affected`,
});

export const skippedBuild = (ctx) => ({
  status: 'success',
  title: 'Skipping build',
  output: `Skipped build because no story files were affected`,
});

export const skipFailed = (ctx) => ({
  status: 'error',
  title: 'Skipping build',
  output: `Failed to skip build`,
});

export const preparing = (ctx) => ({
  status: 'pending',
  title: 'Publishing your built Storybook',
  output: `Retrieving target location`,
});

export const starting = (ctx) => ({
  status: 'pending',
  title: 'Publishing your built Storybook',
  output: `Starting publish`,
});

export const uploading = (ctx) => ({
  status: 'pending',
  title: 'Publishing your built Storybook',
  output: `[${progressBar(ctx.percentage)}] ${ctx.percentage}%`,
});

export const success = (ctx) => ({
  status: 'success',
  title: `Publish complete in ${getDuration(ctx)}`,
  output: `View your Storybook at ${baseStorybookUrl(ctx.isolatorUrl)}`,
});

export const failed = (ctx) => ({
  status: 'error',
  title: 'Publishing your built Storybook',
  output: `Failed to upload ${ctx.path}`,
});
