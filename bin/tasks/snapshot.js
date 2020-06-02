/* eslint-disable no-param-reassign */
import { createTask, transitionTo } from '../lib/tasks';
import { delay, matchesBranch } from '../lib/utils';
import buildHasChanges from '../ui/messages/errors/buildHasChanges';
import buildHasErrors from '../ui/messages/errors/buildHasErrors';
import speedUpCI from '../ui/messages/info/speedUpCI';
import {
  buildComplete,
  buildError,
  buildFailed,
  buildPassed,
  initial,
  pending,
} from '../ui/tasks/snapshot';

const TesterBuildQuery = `
  query TesterBuildQuery($buildNumber: Int!) {
    app {
      build(number: $buildNumber) {
        id
        status
        autoAcceptChanges
        inProgressCount: snapshotCount(statuses: [SNAPSHOT_IN_PROGRESS])
        snapshotCount
        changeCount
        errorCount: snapshotCount(statuses: [SNAPSHOT_CAPTURE_ERROR])
      }
    }
  }
`;

export const takeSnapshots = async (ctx, task) => {
  const { client, git, log, options, runtimeSpecs } = ctx;
  const { number: buildNumber } = ctx.build;

  if (ctx.build.app.repository && ctx.uploadedBytes) {
    log.info('');
    log.info(speedUpCI(ctx.build.app.repository.provider));
  }

  const snapshotLabels =
    options.interactive &&
    runtimeSpecs.reduce((acc, { name, component, parameters = {} }) => {
      const { viewports } = parameters;
      for (let i = 0; i < (viewports ? viewports.length : 1); i += 1) {
        const suffix = viewports ? ` [${viewports[i]}px]` : '';
        const label = `${component.displayName} › ${name}${suffix}`;
        acc.push(label);
      }
      return acc;
    }, []);

  const waitForBuild = async () => {
    const { app } = await client.runQuery(TesterBuildQuery, { buildNumber });
    ctx.build = { ...ctx.build, ...app.build };

    if (app.build.status !== 'BUILD_IN_PROGRESS') {
      return ctx.build;
    }

    if (options.interactive) {
      const { inProgressCount, snapshotCount } = ctx.build;
      const cursor = snapshotCount - inProgressCount + 1;
      const label = snapshotLabels[cursor - 1] || '';
      task.output = pending({ ...ctx, cursor, label }).output;
    }

    await delay(ctx.env.CHROMATIC_POLL_INTERVAL);
    return waitForBuild();
  };

  const build = await waitForBuild();

  switch (build.status) {
    case 'BUILD_PASSED':
      ctx.exitCode = 0;
      transitionTo(buildPassed, true)(ctx, task);
      break;

    // They may have sneakily looked at the build while we were waiting
    case 'BUILD_ACCEPTED':
    case 'BUILD_PENDING':
    case 'BUILD_DENIED': {
      ctx.exitCode = 0;
      if (!build.autoAcceptChanges && !matchesBranch(options.exitZeroOnChanges, git.branch)) {
        ctx.exitCode = 1;
        ctx.log.error(buildHasChanges(ctx));
      }
      transitionTo(buildComplete, true)(ctx, task);
      break;
    }

    case 'BUILD_FAILED':
      ctx.exitCode = 2;
      ctx.log.error(buildHasErrors(ctx));
      transitionTo(buildFailed, true)(ctx, task);
      break;

    case 'BUILD_TIMED_OUT':
    case 'BUILD_ERROR':
      ctx.exitCode = 3;
      transitionTo(buildError, true)(ctx, task);
      break;

    default:
      throw new Error(`Unexpected build status: ${build.status}`);
  }
};

export default createTask({
  title: initial.title,
  skip: ctx => ctx.skipSnapshots,
  steps: [transitionTo(pending), takeSnapshots],
});
