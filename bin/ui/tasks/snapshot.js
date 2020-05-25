import pluralize from 'pluralize';
import { getDuration } from '../../lib/tasks';
import { progress as progressBar } from '../../lib/utils';

export const initial = {
  status: 'initial',
  title: 'Take snapshots of your stories',
};

const stats = ctx => ({
  errors: pluralize('error', ctx.build.errorCount, true),
  changes: pluralize('change', ctx.build.changeCount, true),
  snapshots: pluralize('snapshot', ctx.build.snapshotCount, true),
  components: pluralize('component', ctx.build.componentCount, true),
  specs: pluralize('story', ctx.build.specCount, true),
});

export const pending = ctx => {
  const { cursor = 0, label = '' } = ctx;
  const { errors, snapshots, components, specs } = stats(ctx);
  const percentage = Math.round((cursor / ctx.build.snapshotCount) * 100);
  const counts = `${cursor}/${ctx.build.snapshotCount}`;
  const errs = ctx.build.errorCount ? `(${errors}) ` : '';
  return {
    status: 'pending',
    title: `Taking ${snapshots} (${components}, ${specs})`,
    output: cursor
      ? `[${progressBar(percentage)}] ${counts} ${errs} ${label}`
      : 'This may take a few minutes',
  };
};

export const buildPassed = ctx => {
  const { snapshots, components, specs } = stats(ctx);
  return {
    status: 'success',
    title: ctx.build.features.uiTests
      ? `Build ${ctx.build.number} passed!`
      : `Build ${ctx.build.number} published!`,
    output: `Took ${snapshots} (${components}, ${specs}) in ${getDuration(ctx)}; no changes found`,
  };
};

export const buildComplete = ctx => {
  const { changes, snapshots, components, specs } = stats(ctx);
  return {
    status: 'success',
    title: `Build ${ctx.build.number} completed in ${getDuration(ctx)}`,
    output: ctx.build.autoAcceptChanges
      ? `Auto-accepted ${changes} (${snapshots}, ${components}, ${specs})`
      : `Found ${changes} (${components}, ${specs}, ${snapshots}); exiting with status code ${ctx.exitCode}`,
  };
};

export const buildFailed = ctx => {
  const { errors, snapshots, components, specs } = stats(ctx);
  return {
    status: 'error',
    title: `Build ${ctx.build.number} failed after ${getDuration(ctx)}`,
    output: `Found ${errors} (${components}, ${specs}, ${snapshots}); exiting with status code ${ctx.exitCode}`,
  };
};

export const buildError = ctx => {
  return {
    status: 'error',
    title: `Oops. Build ${ctx.build.number} failed to run. Please try again.`,
    output: `Exiting with status code ${ctx.exitCode}`,
  };
};
