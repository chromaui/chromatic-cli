import pluralize from 'pluralize';
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
  const { snapshots, components, specs } = stats(ctx);
  const percentage = Math.round((ctx.cursor / ctx.build.snapshotCount) * 100);
  const counts = `${ctx.cursor}/${ctx.build.snapshotCount}`;
  return {
    status: 'pending',
    title: `Taking ${snapshots} (${components}, ${specs})`,
    output: `[${progressBar(percentage)}] ${counts}  Component › Story [600px]`,
  };
};

export const buildPassed = ctx => {
  const { snapshots, components, specs } = stats(ctx);
  return {
    status: 'success',
    title: ctx.build.features.uiTests
      ? `Build ${ctx.build.number} passed!`
      : `Build ${ctx.build.number} published!`,
    output: `Took ${snapshots} (${components}, ${specs}); no changes found`,
  };
};

export const buildComplete = ctx => {
  const { changes, snapshots, components, specs } = stats(ctx);
  return {
    status: 'success',
    title: `Build ${ctx.build.number} complete`,
    output: ctx.build.autoAcceptChanges
      ? `Auto-accepted ${changes} (${snapshots}, ${components}, ${specs})`
      : `Found ${changes} (${components}, ${specs}, ${snapshots}); exiting with status code ${ctx.exitCode}`,
  };
};

export const buildFailed = ctx => {
  const { errors, snapshots, components, specs } = stats(ctx);
  return {
    status: 'error',
    title: `Build ${ctx.build.number} failed`,
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
