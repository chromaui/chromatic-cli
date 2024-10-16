import pluralize from 'pluralize';

import { isE2EBuild } from '../../lib/e2eUtils';
import { getDuration } from '../../lib/tasks';
import { progressBar } from '../../lib/utils';
import { Context } from '../../types';

const testType = (ctx: Context) => (isE2EBuild(ctx.options) ? 'test suite' : 'stories');

export const initial = (ctx: Context) => ({
  status: 'initial',
  title: `Test your ${testType(ctx)}`,
});

export const dryRun = (ctx: Context) => ({
  status: 'skipped',
  title: `Test your ${testType(ctx)}`,
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
    e2eTests: pluralize('test', build.specCount, true),
    components: pluralize('component', build.componentCount, true),
    skips: pluralize('test', build.testCount - build.actualTestCount, true),
    snapshots: pluralize('snapshot', build.actualCaptureCount, true),
  };
};

// TODO: refactor this function
// eslint-disable-next-line complexity
export const pending = (ctx: Context, { cursor = 0, label = '' } = {}) => {
  const { build, options, onlyStoryFiles } = ctx;
  if (build.actualTestCount === 0) {
    return {
      status: 'pending',
      title: 'Finalizing build',
      output: onlyStoryFiles ? 'All tests skipped' : 'No tests run',
    };
  }

  const { errors, tests, skips } = stats(ctx);
  const matching = options.onlyStoryNames
    ? ` for stories matching ${options.onlyStoryNames.map((v) => `'${v}'`).join(', ')}`
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
      ? `${progressBar(percentage)} ${counts} ${errs} ${label}`
      : 'This may take a few minutes',
  };
};

export const buildPassed = (ctx: Context) => {
  const { snapshots, components, stories, e2eTests } = stats(ctx);
  const output = isE2EBuild(ctx.options)
    ? `Tested ${e2eTests}; captured ${snapshots} in ${getDuration(ctx)}`
    : `Tested ${stories} across ${components}; captured ${snapshots} in ${getDuration(ctx)}`;

  return {
    status: 'success',
    title: `Build ${ctx.build.number} passed!`,
    output,
  };
};

export const buildComplete = (ctx: Context) => {
  const { snapshots, components, stories, e2eTests } = stats(ctx);
  const output = isE2EBuild(ctx.options)
    ? `Tested ${e2eTests}; captured ${snapshots} in ${getDuration(ctx)}`
    : `Tested ${stories} across ${components}; captured ${snapshots} in ${getDuration(ctx)}`;

  return {
    status: 'success',
    title: ctx.build.autoAcceptChanges
      ? `Build ${ctx.build.number} auto-accepted`
      : `Build ${ctx.build.number} completed`,
    output,
  };
};

export const buildBroken = (ctx: Context) => {
  const { snapshots, components, stories, e2eTests, errors } = stats(ctx);
  const output = isE2EBuild(ctx.options)
    ? `Tested ${e2eTests}; captured ${snapshots} and found ${errors}`
    : `Tested ${stories} across ${components}; captured ${snapshots} and found ${errors}`;

  return {
    status: 'error',
    title: `Build ${ctx.build.number} failed after ${getDuration(ctx)}`,
    output,
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
    title: `Test your ${testType(ctx)}`,
    output: ctx.isPublishOnly
      ? `No UI tests or UI review enabled`
      : `Skipped due to ${ctx.options.list ? '--list' : '--exit-once-uploaded'}`,
  };
};
