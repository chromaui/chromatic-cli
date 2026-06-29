import waitForBuildToComplete, {
  BuildProgressMessage,
  NotifyConnectionError,
  NotifyServiceAuthenticationError,
  NotifyServiceError,
  NotifyServiceMessageTimeoutError,
} from '@cli/waitForBuildToComplete';
import * as Sentry from '@sentry/node';

import { exitCodes, setExitCode } from '../lib/setExitCode';
import { delay, throttle } from '../lib/utilities';
import { Context, Deps, TaskResult } from '../types';
import buildHasChanges from '../ui/messages/errors/buildHasChanges';
import buildHasErrors from '../ui/messages/errors/buildHasErrors';
import buildPassedMessage from '../ui/messages/info/buildPassed';
import speedUpCI from '../ui/messages/info/speedUpCI';
import { pending } from '../ui/tasks/snapshot';

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

// Discriminates which terminal message `applyOutput` logs once the exit code is set; the success
// frame itself is chosen by `transitions.success` branching on the completed `ctx.build.status`.
// `build` carries the polled-to-completion build back to `applyOutput`, which writes it onto
// Context so the success transition reads the completed status.
export interface SnapshotOutput {
  exitCode: number;
  userError: boolean;
  log?: 'passed' | 'changes' | 'errors';
  build: Context['build'];
}

export interface SnapshotInput {
  build: Context['build'];
  skipSnapshots?: boolean;
  uploadedBytes?: number;
  matchesBranch: Context['git']['matchesBranch'];
  onlyStoryFiles?: Context['onlyStoryFiles'];
}

export type SnapshotDeps = Pick<Deps, 'client' | 'log' | 'env' | 'options' | 'report'>;

/**
 * Poll Chromatic until the published build finishes, reporting snapshot-count progress, then map the
 * terminal build status to an exit code and the message the snapshot task should log.
 *
 * @param deps Narrow set of cross-cutting dependencies the task needs.
 * @param input Per-pipeline-run input extracted from Context at the seam.
 *
 * @returns A TaskResult conveying the terminal exit code, or a self-skip for `--dry-run` / publish-only.
 */
// TODO: refactor this function
// eslint-disable-next-line complexity
export async function snapshotProject(
  deps: SnapshotDeps,
  input: SnapshotInput
): Promise<TaskResult<SnapshotOutput>> {
  const { client, log, env, options } = deps;
  const { skipSnapshots, uploadedBytes, matchesBranch, onlyStoryFiles } = input;

  if (skipSnapshots || options.dryRun) {
    return { kind: 'skip-self' };
  }

  // Reassigned each poll; the progress reporter and the terminal switch read the latest value.
  let build = input.build;
  const { app, number, tests, testCount, actualTestCount, reportToken } = build;

  if (app.repository && uploadedBytes && !options.junitReport) {
    log.info(speedUpCI(app.repository.provider));
  }

  const testLabels =
    options.interactive &&
    testCount === actualTestCount &&
    tests?.map(({ spec, parameters, mode }) => {
      const testSuffixName = mode.name || `[${parameters.viewport}px]`;
      const suffix = parameters.viewportIsDefault ? '' : testSuffixName;
      return `${spec.component.displayName} › ${spec.name} ${suffix}`;
    });

  const updateProgress = throttle(
    ({ cursor, label }) => {
      deps.report({
        output: pending({ build, options, onlyStoryFiles }, { cursor, label }).output,
        progress: { progress: cursor, total: actualTestCount, unit: 'snapshots' },
        build,
      });
    },
    // Avoid spamming the logs with progress updates in non-interactive mode
    options.interactive ? env.CHROMATIC_POLL_INTERVAL : env.CHROMATIC_OUTPUT_INTERVAL
  );

  const uiStateUpdater = (buildProgressData: BuildProgressMessage | Context['build']): void => {
    if (actualTestCount > 0) {
      const { inProgressCount = 0 } = buildProgressData;
      const cursor = actualTestCount - inProgressCount + 1;
      const label = (testLabels && testLabels[cursor - 1]) || '';
      updateProgress({ cursor, label });
    }
  };

  const getCompletedBuild = async (): Promise<Context['build']> => {
    const queryOptions = { headers: { Authorization: `Bearer ${reportToken}` } };
    const data = await client.runQuery<BuildQueryResult>(
      SnapshotBuildQuery,
      { number },
      queryOptions
    );
    build = { ...build, ...data.app.build };

    if (build.completedAt) {
      return build;
    }

    uiStateUpdater(build);

    await delay(env.CHROMATIC_POLL_INTERVAL);
    return getCompletedBuild();
  };

  if (actualTestCount > 0) {
    await waitForBuildToCompleteAndHandleErrors(deps, build.id, uiStateUpdater, reportToken);
  }

  const completedBuild = await getCompletedBuild();

  switch (completedBuild.status) {
    case 'PASSED':
      return {
        kind: 'continue',
        output: { exitCode: exitCodes.OK, userError: false, log: 'passed', build: completedBuild },
      };

    // They may have sneakily looked at the build while we were waiting
    case 'ACCEPTED':
    case 'PENDING':
    case 'DENIED': {
      const passed =
        completedBuild.autoAcceptChanges ||
        // The boolean version of this check is handled by ctx.git.matchesBranch
        options?.exitZeroOnChanges === 'true' ||
        matchesBranch?.(options?.exitZeroOnChanges || false);
      return passed
        ? {
            kind: 'continue',
            output: {
              exitCode: exitCodes.OK,
              userError: false,
              log: 'passed',
              build: completedBuild,
            },
          }
        : {
            kind: 'continue',
            output: {
              exitCode: exitCodes.BUILD_HAS_CHANGES,
              userError: true,
              log: 'changes',
              build: completedBuild,
            },
          };
    }

    case 'BROKEN':
      return {
        kind: 'continue',
        output: {
          exitCode: exitCodes.BUILD_HAS_ERRORS,
          userError: true,
          log: 'errors',
          build: completedBuild,
        },
      };

    case 'FAILED':
      return {
        kind: 'continue',
        output: { exitCode: exitCodes.BUILD_FAILED, userError: false, build: completedBuild },
      };

    case 'CANCELLED':
      return {
        kind: 'continue',
        output: { exitCode: exitCodes.BUILD_WAS_CANCELED, userError: true, build: completedBuild },
      };

    default:
      throw new Error(`Unexpected build status: ${completedBuild.status}`);
  }
}

async function waitForBuildToCompleteAndHandleErrors(
  deps: Pick<Deps, 'env' | 'log'>,
  buildId: string,
  uiStateUpdater: (buildProgressData: BuildProgressMessage | Context['build']) => void,
  reportToken: string | undefined
) {
  const { env, log } = deps;
  try {
    await waitForBuildToComplete({
      notifyServiceUrl: env.CHROMATIC_NOTIFY_SERVICE_URL,
      buildId,
      progressMessageCallback: uiStateUpdater,
      log,
      headers: {
        Authorization: `Bearer ${reportToken}`,
      },
    });
  } catch (error) {
    Sentry.captureException(error);
    if (error instanceof NotifyConnectionError) {
      log.debug(
        `Failed to connect to notify service, falling back to polling: code: ${error.statusCode}, original error: ${error.originalError?.message}`
      );
    } else if (error instanceof NotifyServiceMessageTimeoutError) {
      log.debug('Timed out waiting for message from notify service, falling back to polling');
    } else if (error instanceof NotifyServiceAuthenticationError) {
      log.debug(`Error authenticating with notify service: ${error.statusCode} ${error.message}`);
    } else if (error instanceof NotifyServiceError) {
      log.debug(
        `Error getting updates from notify service: ${error.message} code: ${error.statusCode}, reason: ${error.reason}, original error: ${error.originalError?.message}`
      );
    } else {
      log.error(`Unexpected error from notify service: ${error.message}`);
    }
  }
}

export const extractSnapshotInput = (ctx: Context): SnapshotInput => ({
  build: ctx.build,
  skipSnapshots: ctx.skipSnapshots,
  uploadedBytes: ctx.uploadedBytes,
  matchesBranch: ctx.git.matchesBranch,
  onlyStoryFiles: ctx.onlyStoryFiles,
});

export const applySnapshotOutput = (ctx: Context, output: SnapshotOutput) => {
  ctx.build = output.build;
  setExitCode(ctx, output.exitCode, output.userError);

  switch (output.log) {
    case 'passed':
      ctx.log.info(buildPassedMessage(ctx));
      return;
    case 'changes':
      ctx.log.error(buildHasChanges(ctx));
      return;
    case 'errors':
      ctx.log.error(buildHasErrors(ctx));
      return;
    default:
      return;
  }
};
