import pluralize from 'pluralize';

import { getDuration } from '../../lib/tasks';
import { baseStorybookUrl, progress as progressBar } from '../../lib/utils';
import { Context } from '../../types';

export const initial = {
  status: 'initial',
  title: 'Publish your built Storybook',
};

export const dryRun = () => ({
  status: 'skipped',
  title: 'Publish your built Storybook',
  output: 'Skipped due to --dry-run',
});

export const skipped = (ctx: Context) => ({
  status: 'skipped',
  title: 'Publish your built Storybook [skipped]',
  output: `Using hosted Storybook at ${ctx.options.storybookUrl}`,
});

export const validating = () => ({
  status: 'pending',
  title: 'Publish your built Storybook',
  output: `Validating Storybook files`,
});

export const invalid = (ctx: Context, error?: Error) => {
  let output = `Invalid Storybook build at ${ctx.sourceDir}`;
  if (ctx.buildLogFile) output += ' (check the build log)';
  if (error) output += `: ${error.message}`;
  return {
    status: 'error',
    title: 'Publishing your built Storybook',
    output,
  };
};

export const tracing = (ctx: Context) => {
  const files = pluralize('file', ctx.git.changedFiles.length, true);
  return {
    status: 'pending',
    title: 'Retrieving story files affected by recent changes',
    output: `Traversing dependencies for ${files} that changed since the last build`,
  };
};

export const bailed = (ctx: Context) => {
  const { changedPackageFiles, changedStorybookFiles, changedStaticFiles } =
    ctx.turboSnap.bailReason;
  const [firstFile, ...otherFiles] =
    changedPackageFiles || changedStorybookFiles || changedStaticFiles;
  const siblings = pluralize('sibling', otherFiles.length, true);
  let output = `Found a change in ${firstFile}`;
  if (otherFiles.length === 1) output += ' or its sibling';
  if (otherFiles.length > 1) output += ` or one of its ${siblings}`;
  return {
    status: 'pending',
    title: 'TurboSnap disabled',
    output,
  };
};

export const traced = (ctx: Context) => {
  const files = pluralize('story file', ctx.onlyStoryFiles.length, true);
  return {
    status: 'pending',
    title: 'Retrieved story files affected by recent changes',
    output: `Found ${files} affected by recent changes`,
  };
};

export const preparing = () => ({
  status: 'pending',
  title: 'Publishing your built Storybook',
  output: `Retrieving target location`,
});

export const starting = () => ({
  status: 'pending',
  title: 'Publishing your built Storybook',
  output: `Starting publish`,
});

export const uploading = ({ percentage }: { percentage: number }) => ({
  status: 'pending',
  title: 'Publishing your built Storybook',
  output: `[${progressBar(percentage)}] ${percentage}%`,
});

export const success = (ctx: Context) => ({
  status: 'success',
  title: `Publish complete in ${getDuration(ctx)}`,
  output: `View your Storybook at ${baseStorybookUrl(ctx.isolatorUrl)}`,
});

export const failed = ({ path }: { path: string }) => ({
  status: 'error',
  title: 'Publishing your built Storybook',
  output: `Failed to upload ${path}`,
});
