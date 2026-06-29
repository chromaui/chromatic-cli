import pluralize from 'pluralize';

import { isE2EBuild } from '../../lib/e2eUtils';
import { getDuration } from '../../lib/tasks';
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
    e2eErrors: pluralize('test error', build.errorCount, true),
    changes: pluralize('change', build.changeCount, true),
    stories: pluralize('story', build.specCount, true),
    e2eTests: pluralize('test', build.specCount, true),
    components: pluralize('component', build.componentCount, true),
    skips: pluralize('test', build.testCount - build.actualTestCount, true),
    snapshots: pluralize('snapshot', build.actualCaptureCount, true),
  };
};

// TODO: refactor this function
/* eslint-disable complexity */
export const pending = (
  ctx: Pick<Context, 'build' | 'options' | 'onlyStoryFiles'>,
  { cursor = 0, label = '' } = {}
) => {
  const { build, options, onlyStoryFiles } = ctx;
  // `runTask` renders this pending state before the task body runs, so it must survive skip paths
  // that have no build yet — notably `--dry-run`, where `ctx.build` is undefined.
  if (!build) {
    return {
      status: 'pending',
      title: `Test your ${isE2EBuild(options) ? 'test suite' : 'stories'}`,
      output: 'This may take a few minutes',
    };
  }
  if (build.actualTestCount === 0) {
    return {
      status: 'pending',
      title: 'Finalizing build',
      output: onlyStoryFiles ? 'All tests skipped' : 'No tests run',
    };
  }

  const { errors, e2eErrors, tests, skips } = stats(ctx);
  const matching = options.onlyStoryNames
    ? ` for stories matching ${options.onlyStoryNames.map((v) => `'${v}'`).join(', ')}`
    : '';
  const affected = onlyStoryFiles ? ' affected by recent changes' : '';
  const skipping = build.testCount > build.actualTestCount ? ` (skipping ${skips})` : '';
  // The cursor is a 1-based "now capturing" index (`actualTestCount - inProgressCount + 1`), so it
  // reaches `actualTestCount + 1` once nothing is in progress. Clamp it so the label never exceeds 100%.
  const boundedCursor = Math.min(cursor, build.actualTestCount);
  const percentage = Math.round((boundedCursor / build.actualTestCount) * 100);
  const counts = `${boundedCursor}/${build.actualTestCount}`;

  let errs = '';
  if (build.errorCount) {
    errs = isE2EBuild(ctx.options) ? `(${e2eErrors}) ` : `(${errors}) `;
  }

  return {
    status: 'pending',
    title: `Running ${tests}${matching}${affected}${skipping}`,
    output: cursor ? `${percentage}% ${counts} ${errs} ${label}` : 'This may take a few minutes',
  };
};
/* eslint-enable complexity */

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
  const { snapshots, components, stories, e2eTests, errors, e2eErrors } = stats(ctx);
  const output = isE2EBuild(ctx.options)
    ? `Tested ${e2eTests}; captured ${snapshots} and found ${e2eErrors}`
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

// The snapshot task's terminal frame: `runTask` always drives the `continue` result through
// `renderer.succeed`, so all five build outcomes (including the broken/failed/canceled ones, which
// carry `status: 'error'` and render as red failure frames) branch from here on the completed status.
export const success = (ctx: Context) => {
  switch (ctx.build.status) {
    case 'PASSED':
      return buildPassed(ctx);
    case 'BROKEN':
      return buildBroken(ctx);
    case 'FAILED':
      return buildFailed(ctx);
    case 'CANCELLED':
      return buildCanceled(ctx);
    default:
      return buildComplete(ctx);
  }
};
