import pluralize from 'pluralize';

import { getDuration } from '../../lib/tasks';
import { progress as progressBar } from '../../lib/utils';

export const initial = {
  status: 'initial',
  title: 'Test your stories',
};

export const stats = (ctx) => {
  return {
    tests: pluralize('test', ctx.build.actualTestCount, true),
    errors: pluralize('error', ctx.build.errorCount, true),
    changes: pluralize('change', ctx.build.changeCount, true),
    stories: pluralize('story', ctx.build.specCount, true),
    components: pluralize('component', ctx.build.componentCount, true),
    skips: pluralize('test', ctx.build.testCount - ctx.build.actualTestCount, true),
    snapshots: pluralize('snapshot', ctx.build.actualCaptureCount, true),
  };
};

export const pending = (ctx) => {
  const { build, options, onlyStoryFiles, cursor = 0, label = '' } = ctx;
  const { errors, tests, skips } = stats(ctx);
  const matching = options.only ? ` for stories matching '${options.only}'` : '';
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

export const buildPassed = (ctx) => {
  const { snapshots, components, stories } = stats(ctx);
  return {
    status: 'success',
    title: `Build ${ctx.build.number} passed!`,
    output: `Tested ${stories} across ${components}; captured ${snapshots} in ${getDuration(ctx)}`,
  };
};

export const buildComplete = (ctx) => {
  const { snapshots, components, stories } = stats(ctx);
  return {
    status: 'success',
    title: ctx.build.autoAcceptChanges
      ? `Build ${ctx.build.number} auto-accepted`
      : `Build ${ctx.build.number} completed`,
    output: `Tested ${stories} across ${components}; captured ${snapshots} in ${getDuration(ctx)}`,
  };
};

export const buildFailed = (ctx) => {
  const { snapshots, components, stories, errors } = stats(ctx);
  return {
    status: 'error',
    title: `Build ${ctx.build.number} failed after ${getDuration(ctx)}`,
    output: `Tested ${stories} across ${components}; captured ${snapshots} and found ${errors}`,
  };
};

export const buildError = (ctx) => {
  return {
    status: 'error',
    title: `Build ${ctx.build.number} errored`,
    output: `Please try again, or contact us if the problem persists`,
  };
};

export const skipped = (ctx) => {
  return {
    status: 'skipped',
    title: 'Test your stories',
    output: ctx.isPublishOnly
      ? `No UI tests or UI review enabled`
      : `Skipped due to ${ctx.options.list ? '--list' : '--exit-once-uploaded'}`,
  };
};
