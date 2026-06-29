import pluralize from 'pluralize';

import { isE2EBuild } from '../../lib/e2eUtils';
import { Context } from '../../types';
import { buildType } from './utilities';

export const initial = (ctx: Context) => ({
  status: 'initial',
  title: `Verify your ${buildType(ctx)}`,
});

export const dryRun = (ctx: Context) => ({
  status: 'skipped',
  title: `Verify your ${buildType(ctx)}`,
  output: 'Skipped due to --dry-run',
});

export const pending = (ctx: Context) => ({
  status: 'pending',
  title: `Verifying your ${buildType(ctx)}`,
  output: 'This may take a few minutes',
});

export const publishFailed = (ctx: Pick<Context, 'options'>) => ({
  status: 'error',
  title: `Verifying your ${buildType(ctx)}`,
  output: 'Failed to publish build',
});

export const runOnlyFiles = (ctx: Pick<Context, 'options' | 'onlyStoryFiles'>) => ({
  status: 'pending',
  title: 'Starting partial build',
  output: ctx.options.onlyStoryFiles
    ? `Snapshots will be limited to story files matching ${ctx.options.onlyStoryFiles
        .map((v) => `'${v}'`)
        .join(', ')}`
    : `Snapshots will be limited to ${ctx.onlyStoryFiles?.length} story files affected by recent changes`,
});

export const runOnlyNames = (ctx: Pick<Context, 'options'>) => {
  const testType = isE2EBuild(ctx.options) ? 'tests' : 'stories';

  return {
    status: 'pending',
    title: 'Starting partial build',
    output: `Snapshots will be limited to ${testType} matching ${ctx.options.onlyStoryNames
      ?.map((v) => `'${v}'`)
      .join(', ')}`,
  };
};

export const awaitingUpgrades = (
  ctx: Pick<Context, 'options'>,
  upgradeBuilds: { completedAt?: number | null }[]
) => {
  const pending = upgradeBuilds.filter((upgrade) => !upgrade.completedAt).length;
  const upgrades = pluralize('upgrade build', upgradeBuilds.length, true);
  return {
    status: 'pending',
    title: `Verifying your ${buildType(ctx)}`,
    output: `Waiting for ${pending}/${upgrades} to complete`,
  };
};

export const success = (ctx: Context) => ({
  status: 'success',
  title: ctx.isPublishOnly
    ? `Published your ${buildType(ctx)}`
    : `Started build ${ctx.build.number}`,
  output: ctx.isOnboarding
    ? `Continue setup at ${ctx.build.app.setupUrl}`
    : `View build details at ${ctx.build.webUrl}`,
});
