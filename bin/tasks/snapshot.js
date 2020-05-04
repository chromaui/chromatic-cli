/* eslint-disable no-param-reassign */
import pluralize from 'pluralize';
import { TesterBuildQuery } from '../io/gql-queries';
import { createTask, setTitle } from '../lib/tasks';
import { delay, matchesBranch, progress } from '../lib/utils';
import speedUpCI from '../ui/info/speedUpCI';
import { CHROMATIC_POLL_INTERVAL } from '../constants';

const takeSnapshots = async (ctx, task) => {
  const { client, git, log, options } = ctx;
  const { number: buildNumber } = ctx.build;

  if (ctx.build.app.repository && ctx.uploadedBytes) {
    log.info('');
    log.info(speedUpCI(ctx.build.app.repository.provider));
  }

  const waitForBuild = async () => {
    const { app } = await client.runQuery(TesterBuildQuery, { buildNumber });
    ctx.build = { ...ctx.build, ...app.build };

    if (app.build.status !== 'BUILD_IN_PROGRESS') {
      if (app.build.changeCount) process.exitCode = 1;
      return ctx.build;
    }

    const { errorCount, inProgressCount, snapshotCount, snapshots } = ctx.build;
    const cursor = snapshotCount - inProgressCount + 1;
    const snapshot = snapshots[cursor - 1];

    const bar = `[${progress(Math.round((cursor / snapshotCount) * 100))}]`;
    const counts = `${cursor}/${snapshotCount}`;
    const errors = errorCount ? `(${pluralize('error', errorCount, true)}) ` : '';
    const story = `${snapshot.spec.component.displayName} › ${snapshot.spec.name}`;
    task.output = `${bar} ${counts} ${errors} ${story}`;

    await delay(CHROMATIC_POLL_INTERVAL);
    return waitForBuild();
  };

  const build = await waitForBuild();
  const changes = pluralize('change', build.changeCount, true);
  const snapshots = pluralize('snapshot', build.snapshotCount, true);
  const components = pluralize('component', build.componentCount, true);
  const specs = pluralize('story', build.specCount, true);
  const errors = pluralize('error', build.errorCount, true);

  switch (build.status) {
    case 'BUILD_PASSED':
      ctx.exitCode = 0;

      setTitle(
        build.features.uiTests
          ? `Build ${build.number} passed!`
          : `Build ${build.number} published!`,
        `Took ${snapshots} (${components}, ${specs}); no changes found`
      )(ctx, task);
      break;

    // They may have sneakily looked at the build while we were waiting
    case 'BUILD_ACCEPTED':
    case 'BUILD_PENDING':
    case 'BUILD_DENIED': {
      ctx.exitCode =
        build.autoAcceptChanges || matchesBranch(options.exitZeroOnChanges, git.branch) ? 0 : 1;
      setTitle(
        `Build ${build.number} complete`,
        build.autoAcceptChanges
          ? `Auto-accepted ${changes} (${snapshots}, ${components}, ${specs})`
          : `Found ${changes} (${snapshots}, ${components}, ${specs}); exiting with status code ${ctx.exitCode}`
      )(ctx, task);
      break;
    }

    case 'BUILD_FAILED':
      ctx.exitCode = 2;
      setTitle(
        `Build ${build.number} failed`,
        `Found ${errors} (${snapshots}, ${components}, ${specs}); exiting with status code ${ctx.exitCode}`
      )(ctx, task);
      break;

    case 'BUILD_TIMED_OUT':
    case 'BUILD_ERROR':
      ctx.exitCode = 3;
      setTitle(
        `Oops. Build ${build.number} failed to run. Please try again.`,
        `Exiting with status code ${ctx.exitCode}`
      )(ctx, task);
      break;

    default:
      throw new Error(`Unexpected build status: ${build.status}`);
  }
};

export default createTask({
  title: 'Take snapshots of your stories',
  skip: ctx => ctx.skipSnapshots,
  steps: [
    setTitle(ctx => {
      const snapshots = pluralize('snapshot', ctx.build.snapshotCount, true);
      const components = pluralize('component', ctx.build.componentCount, true);
      const specs = pluralize('story', ctx.build.specCount, true);
      return `Taking ${snapshots} (${components}, ${specs})`;
    }),
    takeSnapshots,
  ],
});
