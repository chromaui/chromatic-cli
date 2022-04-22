/* eslint-disable no-param-reassign */
import { exitCodes, setExitCode } from '../lib/setExitCode';
import { createTask, transitionTo } from '../lib/tasks';
import { waitForBuild } from '../lib/waitForBuild';
import { Context, Task } from '../types';
import buildHasChanges from '../ui/messages/errors/buildHasChanges';
import buildHasErrors from '../ui/messages/errors/buildHasErrors';
import buildPassedMessage from '../ui/messages/info/buildPassed';
import speedUpCI from '../ui/messages/info/speedUpCI';
import {
  buildComplete,
  buildPassed,
  buildBroken,
  buildFailed,
  buildCanceled,
  initial,
  dryRun,
  skipped,
  pending,
} from '../ui/tasks/snapshot';

export const takeSnapshots = async (ctx: Context, task: Task) => {
  const { log, options, uploadedBytes } = ctx;
  const { app, tests, testCount, actualTestCount } = ctx.build;

  if (app.repository && uploadedBytes && !options.junitReport) {
    log.info(speedUpCI(app.repository.provider));
  }

  const testLabels =
    options.interactive &&
    testCount === actualTestCount &&
    tests.map(({ spec, parameters }) => {
      const suffix = parameters.viewportIsDefault ? '' : ` [${parameters.viewport}px]`;
      return `${spec.component.displayName} › ${spec.name}${suffix}`;
    });

  await waitForBuild(ctx, 'Snapshot', (build: Context['build']) => {
    ctx.build = build;
    if (build.status !== 'IN_PROGRESS') {
      return true;
    }
    if (options.interactive) {
      const { inProgressCount } = ctx.build;
      const cursor = actualTestCount - inProgressCount + 1;
      const label = testLabels && testLabels[cursor - 1];
      task.output = pending(ctx, { cursor, label }).output;
    }
    return false;
  });

  switch (ctx.build.status) {
    case 'PASSED':
      setExitCode(ctx, exitCodes.OK);
      ctx.log.info(buildPassedMessage(ctx));
      transitionTo(buildPassed, true)(ctx, task);
      break;

    // They may have sneakily looked at the build while we were waiting
    case 'ACCEPTED':
    case 'PENDING':
    case 'DENIED': {
      if (ctx.build.autoAcceptChanges || ctx.git.matchesBranch(options.exitZeroOnChanges)) {
        setExitCode(ctx, exitCodes.OK);
        ctx.log.info(buildPassedMessage(ctx));
      } else {
        setExitCode(ctx, exitCodes.BUILD_HAS_CHANGES, true);
        ctx.log.error(buildHasChanges(ctx));
      }
      transitionTo(buildComplete, true)(ctx, task);
      break;
    }

    case 'BROKEN':
      setExitCode(ctx, exitCodes.BUILD_HAS_ERRORS, true);
      ctx.log.error(buildHasErrors(ctx));
      transitionTo(buildBroken, true)(ctx, task);
      break;

    case 'FAILED':
      setExitCode(ctx, exitCodes.BUILD_FAILED, false);
      transitionTo(buildFailed, true)(ctx, task);
      break;

    case 'CANCELLED':
      setExitCode(ctx, exitCodes.BUILD_WAS_CANCELED, true);
      transitionTo(buildCanceled, true)(ctx, task);
      break;

    default:
      throw new Error(`Unexpected build status: ${ctx.build.status}`);
  }
};

export default createTask({
  title: initial.title,
  skip: (ctx: Context) => {
    if (ctx.skip) return true;
    if (ctx.skipSnapshots) return skipped(ctx).output;
    if (ctx.options.dryRun) return dryRun().output;
    return false;
  },
  steps: [transitionTo(pending), takeSnapshots],
});
