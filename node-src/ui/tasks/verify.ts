import pluralize from 'pluralize';

import { Context } from '../../types';

export const initial = {
  status: 'initial',
  title: 'Verify your Storybook',
};

export const dryRun = () => ({
  status: 'skipped',
  title: 'Verify your Storybook',
  output: 'Skipped due to --dry-run',
});

export const pending = () => ({
  status: 'pending',
  title: 'Verifying your Storybook',
  output: 'This may take a few minutes',
});

export const publishFailed = () => ({
  status: 'error',
  title: 'Verifying your Storybook',
  output: 'Failed to publish build',
});

export const runOnlyFiles = (ctx: Context) => ({
  status: 'pending',
  title: 'Starting partial build',
  output: ctx.options.onlyStoryFiles
    ? `Snapshots will be limited to story files matching ${ctx.options.onlyStoryFiles
        .map((v) => `'${v}'`)
        .join(', ')}`
    : `Snapshots will be limited to ${ctx.onlyStoryFiles?.length} story files affected by recent changes`,
});

export const runOnlyNames = (ctx: Context) => ({
  status: 'pending',
  title: 'Starting partial build',
  output: ctx.options.onlyStoryNames
    ? `Snapshots will be limited to stories matching ${ctx.options.onlyStoryNames
        .map((v) => `'${v}'`)
        .join(', ')}`
    : `Snapshots will be limited to ${ctx.onlyStoryFiles?.length} story files affected by recent changes`,
});

export const awaitingUpgrades = (ctx: Context, upgradeBuilds: { completedAt?: number }[]) => {
  const pending = upgradeBuilds!.filter((upgrade) => !upgrade.completedAt).length;
  const upgrades = pluralize('upgrade build', upgradeBuilds.length, true);
  return {
    status: 'pending',
    title: 'Verifying your Storybook',
    output: `Waiting for ${pending}/${upgrades} to complete`,
  };
};

export const success = (ctx: Context) => ({
  status: 'success',
  title: ctx.isPublishOnly ? `Published your Storybook` : `Started build ${ctx.build.number}`,
  output: ctx.isOnboarding
    ? `Continue setup at ${ctx.build.app.setupUrl}`
    : `View build details at ${ctx.build.webUrl}`,
});

export const failed = (ctx: Context) => ({
  status: 'error',
  title: 'Verifying your Storybook',
  output: ctx.options.onlyStoryNames
    ? 'Cannot run a build with no stories. Change or omit the --only-story-names predicate.'
    : 'Cannot run a build with no stories. Please add some stories!',
});
