import waitForBuildToComplete, {
  BuildProgressMessage,
  NotifyConnectionError,
  NotifyServiceError,
  NotifyServiceMessageTimeoutError,
} from '@cli/waitForBuildToComplete';
import * as Sentry from '@sentry/node';

import { exitCodes, setExitCode } from '../lib/setExitCode';
import { createTask, transitionTo } from '../lib/tasks';
import { delay, throttle } from '../lib/utils';
import { Context, Task } from '../types';
import buildHasChanges from '../ui/messages/errors/buildHasChanges';
import buildHasErrors from '../ui/messages/errors/buildHasErrors';
import buildPassedMessage from '../ui/messages/info/buildPassed';
import speedUpCI from '../ui/messages/info/speedUpCI';
import {
  buildBroken,
  buildCanceled,
  buildComplete,
  buildFailed,
  buildPassed,
  dryRun,
  initial,
  pending,
  skipped,
} from '../ui/tasks/snapshot';

const SnapshotBuildQuery = `
  query SnapshotBuildQuery($number: Int!) {
    app {
      build(number: $number) {
        id
        status(legacy: false)
        autoAcceptChanges
        inProgressCount: testCount(statuses: [IN_PROGRESS])
        testCount
        changeCount
        errorCount: testCount(statuses: [BROKEN])
        completedAt
      }
    }
  }
`;

interface BuildQueryResult {
  app: {
    build: {
      id: string;
      status: string;
      autoAcceptChanges: boolean;
      inProgressCount: number;
      testCount: number;
      changeCount: number;
      errorCount: number;
      completedAt?: number;
    };
  };
}

// TODO: refactor this function
// eslint-disable-next-line complexity
export const takeSnapshots = async (ctx: Context, task: Task) => {
  const { client, log, uploadedBytes } = ctx;
  const { app, number, tests, testCount, actualTestCount, reportToken } = ctx.build;

  if (app.repository && uploadedBytes && !ctx.options.junitReport) {
    log.info(speedUpCI(app.repository.provider));
  }

  const testLabels =
    ctx.options.interactive &&
    testCount === actualTestCount &&
    tests?.map(({ spec, parameters, mode }) => {
      const testSuffixName = mode.name || `[${parameters.viewport}px]`;
      const suffix = parameters.viewportIsDefault ? '' : testSuffixName;
      return `${spec.component.displayName} › ${spec.name} ${suffix}`;
    });

  const updateProgress = throttle(
    ({ cursor, label }) => {
      task.output = pending(ctx, { cursor, label }).output;
      ctx.options.experimental_onTaskProgress?.(
        { ...ctx },
        { progress: cursor, total: actualTestCount, unit: 'snapshots' }
      );
    },
    // Avoid spamming the logs with progress updates in non-interactive mode
    ctx.options.interactive ? ctx.env.CHROMATIC_POLL_INTERVAL : ctx.env.CHROMATIC_OUTPUT_INTERVAL
  );

  const getCompletedBuild = async (): Promise<Context['build']> => {
    const options = { headers: { Authorization: `Bearer ${reportToken}` } };
    const data = await client.runQuery<BuildQueryResult>(SnapshotBuildQuery, { number }, options);
    ctx.build = { ...ctx.build, ...data.app.build };

    if (ctx.build.completedAt) {
      return ctx.build;
    }

    if (actualTestCount > 0) {
      const { inProgressCount = 0 } = ctx.build;
      const cursor = actualTestCount - inProgressCount + 1;
      const label = (testLabels && testLabels[cursor - 1]) || '';
      updateProgress({ cursor, label });
    }

    await delay(ctx.env.CHROMATIC_POLL_INTERVAL);
    return getCompletedBuild();
  };

  const uiStateUpdater = (message: BuildProgressMessage): void => {
    if (actualTestCount > 0) {
      const { inProgressCount = 0 } = message;
      const cursor = actualTestCount - inProgressCount + 1;
      const label = (testLabels && testLabels[cursor - 1]) || '';
      updateProgress({ cursor, label });
    }
  };
  try {
    await waitForBuildToComplete({
      notifyServiceUrl: ctx.env.CHROMATIC_NOTIFY_SERVICE_URL,
      buildId: ctx.build.id,
      progressMessageCallback: uiStateUpdater,
      log: ctx.log,
      headers: {
        Authorization: `Bearer ${reportToken}`,
      },
    });
  } catch (error) {
    if (error instanceof NotifyConnectionError) {
      ctx.log.error('Failed to connect to notify service, falling back to polling');
    } else if (error instanceof NotifyServiceMessageTimeoutError) {
      ctx.log.error('Timed out waiting for message from notify service, falling back to polling');
      Sentry.captureException(error);
    } else if (error instanceof NotifyServiceError) {
      ctx.log.error(
        `Error getting updates from notify service: ${error.message} code: ${error.statusCode}, reason: ${error.reason}, original error: ${error.originalError?.message}`
      );
    } else {
      ctx.log.error(`Unexpected error from notify service: ${error.message}`);
    }
  }

  const build = await getCompletedBuild();

  switch (build.status) {
    case 'PASSED':
      setExitCode(ctx, exitCodes.OK);
      ctx.log.info(buildPassedMessage(ctx));
      transitionTo(buildPassed, true)(ctx, task);
      break;

    // They may have sneakily looked at the build while we were waiting
    case 'ACCEPTED':
    case 'PENDING':
    case 'DENIED': {
      if (
        build.autoAcceptChanges ||
        // The boolean version of this check is handled by ctx.git.matchesBranch
        ctx.options?.exitZeroOnChanges === 'true' ||
        ctx.git.matchesBranch?.(ctx.options?.exitZeroOnChanges || false)
      ) {
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
      throw new Error(`Unexpected build status: ${build.status}`);
  }
};

/**
 * Sets up the Listr task for snapshotting the Storybook.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns A Listr task.
 */
export default function main(ctx: Context) {
  return createTask({
    name: 'snapshot',
    title: initial(ctx).title,
    skip: (ctx: Context) => {
      if (ctx.skip) return true;
      if (ctx.skipSnapshots) return skipped(ctx).output;
      if (ctx.options.dryRun) return dryRun(ctx).output;
      return false;
    },
    steps: [transitionTo(pending), takeSnapshots],
  });
}
