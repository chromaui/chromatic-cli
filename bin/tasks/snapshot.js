/* eslint-disable no-param-reassign */
import { createTask, transitionTo } from '../lib/tasks';
import { delay } from '../lib/utils';
import buildHasChanges from '../ui/messages/errors/buildHasChanges';
import buildHasErrors from '../ui/messages/errors/buildHasErrors';
import buildPassedMessage from '../ui/messages/info/buildPassed';
import speedUpCI from '../ui/messages/info/speedUpCI';
import {
  buildComplete,
  buildError,
  buildFailed,
  buildPassed,
  initial,
  pending,
  skipped,
} from '../ui/tasks/snapshot';

const TesterBuildQuery = `
  query TesterBuildQuery($buildNumber: Int!) {
    app {
      build(number: $buildNumber) {
        id
        status(legacy: false)
        autoAcceptChanges
        inProgressCount: testCount(statuses: [IN_PROGRESS])
        testCount
        changeCount
        errorCount: testCount(statuses: [BROKEN])
      }
    }
  }
`;

export const takeSnapshots = async (ctx, task) => {
  const { client, log, options } = ctx;
  const { number: buildNumber, tests, testCount, actualTestCount } = ctx.build;

  if (ctx.build.app.repository && ctx.uploadedBytes && !options.junitReport) {
    log.info(speedUpCI(ctx.build.app.repository.provider));
  }

  const testLabels =
    options.interactive &&
    testCount === actualTestCount &&
    tests.map(({ spec, parameters }) => {
      const suffix = parameters.viewportIsDefault ? '' : ` [${parameters.viewport}px]`;
      return `${spec.component.displayName} › ${spec.name}${suffix}`;
    });

  const waitForBuild = async () => {
    const { app } = await client.runQuery(TesterBuildQuery, { buildNumber });
    ctx.build = { ...ctx.build, ...app.build };

    if (app.build.status !== 'IN_PROGRESS') {
      return ctx.build;
    }

    if (options.interactive) {
      const { inProgressCount } = ctx.build;
      const cursor = actualTestCount - inProgressCount + 1;
      const label = testLabels && testLabels[cursor - 1];
      task.output = pending({ ...ctx, cursor, label }).output;
    }

    await delay(ctx.env.CHROMATIC_POLL_INTERVAL);
    return waitForBuild();
  };

  const build = await waitForBuild();

  switch (build.status) {
    case 'PASSED':
      ctx.exitCode = 0;
      ctx.log.info(buildPassedMessage(ctx));
      transitionTo(buildPassed, true)(ctx, task);
      break;

    // They may have sneakily looked at the build while we were waiting
    case 'ACCEPTED':
    case 'PENDING':
    case 'DENIED': {
      if (build.autoAcceptChanges || ctx.git.matchesBranch(options.exitZeroOnChanges)) {
        ctx.exitCode = 0;
        ctx.log.info(buildPassedMessage(ctx));
      } else {
        ctx.exitCode = 1;
        ctx.log.error(buildHasChanges(ctx));
      }
      transitionTo(buildComplete, true)(ctx, task);
      break;
    }

    case 'BROKEN':
      ctx.exitCode = 2;
      ctx.log.error(buildHasErrors(ctx));
      transitionTo(buildFailed, true)(ctx, task);
      break;

    case 'FAILED':
    case 'CANCELLED':
      ctx.exitCode = 3;
      transitionTo(buildError, true)(ctx, task);
      break;

    default:
      throw new Error(`Unexpected build status: ${build.status}`);
  }
};

export default createTask({
  title: initial.title,
  skip: (ctx) => {
    if (ctx.skip) return true;
    if (ctx.skipSnapshots) return skipped(ctx).output;
    return false;
  },
  steps: [transitionTo(pending), takeSnapshots],
});
