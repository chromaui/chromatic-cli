import pluralize from 'pluralize';

import { getDuration } from '../../lib/tasks';
import { progress as progressBar } from '../../lib/utils';
import { Context } from '../../types';

export const initial = {
  status: 'initial',
  title: 'Test your stories',
};

export const dryRun = () => ({
  status: 'skipped',
  title: 'Test your stories',
  output: 'Skipped due to --dry-run',
});

export const stats = ({
  build,
}: {
  build: {
    actualCaptureCount: number;
    actualTestCount: number;
    specCount: number;
    componentCount: number;
    testCount: number;
    changeCount: number;
    errorCount: number;
  };
}) => {
  return {
    tests: pluralize('test', build.actualTestCount, true),
    errors: pluralize('component error', build.errorCount, true),
    changes: pluralize('change', build.changeCount, true),
    stories: pluralize('story', build.specCount, true),
    components: pluralize('component', build.componentCount, true),
    skips: pluralize('test', build.testCount - build.actualTestCount, true),
    snapshots: pluralize('snapshot', build.actualCaptureCount, true),
  };
};

export const pending = (ctx: Context, { cursor = 0, label = '' } = {}) => {
  const { build, options, onlyStoryFiles } = ctx;
  const { errors, tests, skips } = stats(ctx);
  const matching = options.onlyStoryNames
    ? ` for stories matching '${options.onlyStoryNames.join(', ')}'`
    : '';
  const affected = onlyStoryFiles ? ' affected by recent changes' : '';
  const skipping = build.testCount > build.actualTestCount ? ` (skipping ${skips})` : '';
  const percentage = Math.round((cursor / build.actualTestCount) * 100);
  const counts = `${cursor}/${build.actualTestCount}`;
  const errs = build.errorCount ? `(${errors}) ` : '';
  return {
    status: 'pending',
    title: `Running ${tests}${matching}${affected}${skipping}`,
    output: cursor
      ? `[${progressBar(percentage)}] ${counts} ${errs} ${label}`
      : 'This may take a few minutes',
  };
};

export const buildPassed = (ctx: Context) => {
  const { snapshots, components, stories } = stats(ctx);
  return {
    status: 'success',
    title: `Build ${ctx.build.number} passed!`,
    output: `Tested ${stories} across ${components}; captured ${snapshots} in ${getDuration(ctx)}`,
  };
};

export const buildComplete = (ctx: Context) => {
  const { snapshots, components, stories } = stats(ctx);
  return {
    status: 'success',
    title: ctx.build.autoAcceptChanges
      ? `Build ${ctx.build.number} auto-accepted`
      : `Build ${ctx.build.number} completed`,
    output: `Tested ${stories} across ${components}; captured ${snapshots} in ${getDuration(ctx)}`,
  };
};

export const buildBroken = (ctx: Context) => {
  const { snapshots, components, stories, errors } = stats(ctx);
  return {
    status: 'error',
    title: `Build ${ctx.build.number} failed after ${getDuration(ctx)}`,
    output: `Tested ${stories} across ${components}; captured ${snapshots} and found ${errors}`,
  };
};

export const buildFailed = (ctx: Context) => {
  return {
    status: 'error',
    title: `Build ${ctx.build.number} failed due to system error`,
    output: `Please try again, or contact us if the problem persists`,
  };
};

export const buildCanceled = (ctx: Context) => {
  return {
    status: 'error',
    title: `Build ${ctx.build.number} canceled`,
    output: `Someone canceled the build before it completed`,
  };
};

export const skipped = (ctx: Context) => {
  return {
    status: 'skipped',
    title: 'Test your stories',
    output: ctx.isPublishOnly
      ? `No UI tests or UI review enabled`
      : `Skipped due to ${ctx.options.list ? '--list' : '--exit-once-uploaded'}`,
  };
};
