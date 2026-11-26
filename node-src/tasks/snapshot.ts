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
import { testLabel } from '../ui/components/testLabel';
import buildHasChanges from '../ui/messages/errors/buildHasChanges';
import buildHasErrors from '../ui/messages/errors/buildHasErrors';
import buildSummaryMessage, { summaryListsTests } from '../ui/messages/info/buildSummary';
import speedUpCI from '../ui/messages/info/speedUpCI';
import { pending } from '../ui/tasks/snapshot';

// `pendingCount`, `acceptedCount` and `deniedCount` are counted by test status, so IGNORED tests are
// excluded by construction. `changeCount` is counted by test result and includes ignored tests.
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
        ignoredCount: testCount(statuses: [IGNORED])
        pendingCount: testCount(statuses: [PENDING])
        acceptedCount: testCount(statuses: [ACCEPTED])
        deniedCount: testCount(statuses: [DENIED])
        completedAt
      }
    }
  }
`;

// The most tests each section of the result message lists.
const MAX_LISTED_TESTS = 50;

const testFields = `
  spec { name component { name displayName } }
  parameters { viewport viewportIsDefault }
  mode { id name }
`;

// The result message's counts and lists, fetched once the build completes rather than on every
// poll. The counts replace the ones the last poll read, but the build's status and accepted count
// still come from that poll. The index must allow these aliases (graphql-armor maxAliases) and the
// `hasInteractionFailure` argument.
//
// These reads are not one snapshot. If someone reviews a test between the last poll and this
// query, or while the index resolves its fields one by one, the message can disagree with itself,
// such as a pending count of 0 above a listed pending test. That needs a review to land in the
// one or two requests' time between the last poll and this query returning. It changes only the
// printed text and the counts the run reports (`getRunOutput` reads them from `ctx.build`), never
// the exit code, which comes from the poll's status alone. We accept that rather than make the
// index return one consistent read.
const SnapshotBuildTestsQuery = `
  query SnapshotBuildTestsQuery($number: Int!, $limit: Int!) {
    app {
      build(number: $number) {
        errorCount: testCount(statuses: [BROKEN])
        renderFailureCount: testCount(statuses: [BROKEN], hasInteractionFailure: false)
        renderFailureTests: tests(statuses: [BROKEN], hasInteractionFailure: false, limit: $limit) { ${testFields} }
        interactionFailureCount: testCount(statuses: [BROKEN], hasInteractionFailure: true)
        interactionFailureTests: tests(statuses: [BROKEN], hasInteractionFailure: true, limit: $limit) { ${testFields} }
        deniedCount: testCount(statuses: [DENIED])
        deniedTests: tests(statuses: [DENIED], limit: $limit) { ${testFields} }
        pendingCount: testCount(statuses: [PENDING])
        pendingTests: tests(statuses: [PENDING], limit: $limit) { ${testFields} }
        ignoredCount: testCount(statuses: [IGNORED])
        ignoredTests: tests(statuses: [IGNORED], limit: $limit) { ${testFields} }
      }
    }
  }
`;

interface BuildTestsQueryResult {
  app: {
    build: Pick<
      Context['build'],
      | 'errorCount'
      | 'renderFailureCount'
      | 'renderFailureTests'
      | 'interactionFailureCount'
      | 'interactionFailureTests'
      | 'deniedCount'
      | 'deniedTests'
      | 'pendingCount'
      | 'pendingTests'
      | 'ignoredCount'
      | 'ignoredTests'
    >;
  };
}

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
      ignoredCount: number;
      pendingCount: number;
      acceptedCount: number;
      deniedCount: number;
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
  turboSnapOutcome?: Context['turboSnapOutcome'];
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
  const { skipSnapshots, uploadedBytes, matchesBranch, turboSnapOutcome } = input;

  if (skipSnapshots || options.dryRun) {
    return { kind: 'skip-self' };
  }

  // Reassigned each poll; the progress reporter and the terminal switch read the latest value.
  let build = input.build;
  const { app, number, tests, testCount, actualTestCount, reportToken } = build;

  // Local builds (e.g. from the Visual Tests addon) need to wait for results, so don't suggest skipping that.
  if (app.repository && uploadedBytes && !options.junitReport && !options.isLocalBuild) {
    log.info(speedUpCI(app.repository.provider, options.inAction));
  }

  const testLabels =
    options.interactive && testCount === actualTestCount && tests?.map((test) => testLabel(test));

  const updateProgress = throttle(
    ({ cursor, label }) => {
      deps.report({
        output: pending({ build, options, turboSnapOutcome }, { cursor, label }).output,
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

  const output = completedOutput(await getCompletedBuild(), options, matchesBranch);
  if (listsTests(output)) {
    output.build = { ...output.build, ...(await getResultTests(deps, number, reportToken)) };
  }
  return { kind: 'continue', output };
}

// A build with changes passes when they were auto-accepted or --exit-zero-on-changes applies.
const changesPass = (
  completedBuild: Context['build'],
  options: SnapshotDeps['options'],
  matchesBranch: SnapshotInput['matchesBranch']
) =>
  completedBuild.autoAcceptChanges ||
  // The boolean version of this check is handled by ctx.git.matchesBranch
  options?.exitZeroOnChanges === 'true' ||
  matchesBranch?.(options?.exitZeroOnChanges || false);

// Maps a completed build's status to its exit code and the message that reports it.
function completedOutput(
  completedBuild: Context['build'],
  options: SnapshotDeps['options'],
  matchesBranch: SnapshotInput['matchesBranch']
): SnapshotOutput {
  switch (completedBuild.status) {
    case 'PASSED':
      return { exitCode: exitCodes.OK, userError: false, log: 'passed', build: completedBuild };

    // They may have sneakily looked at the build while we were waiting
    case 'ACCEPTED':
    case 'PENDING':
    case 'DENIED': {
      return changesPass(completedBuild, options, matchesBranch)
        ? { exitCode: exitCodes.OK, userError: false, log: 'passed', build: completedBuild }
        : {
            exitCode: exitCodes.BUILD_HAS_CHANGES,
            userError: true,
            log: 'changes',
            build: completedBuild,
          };
    }

    case 'BROKEN':
      return {
        exitCode: exitCodes.BUILD_HAS_ERRORS,
        userError: true,
        log: 'errors',
        build: completedBuild,
      };

    case 'FAILED':
      return { exitCode: exitCodes.BUILD_FAILED, userError: false, build: completedBuild };

    case 'CANCELLED':
      return { exitCode: exitCodes.BUILD_WAS_CANCELED, userError: true, build: completedBuild };

    default:
      throw new Error(`Unexpected build status: ${completedBuild.status}`);
  }
}

// Outcomes whose message is the result block, which lists tests. The errors and changes messages
// always are; the passed message is only for a build that passed because of
// --exit-zero-on-changes.
const listsTests = ({ log, build }: SnapshotOutput) =>
  log === 'errors' || log === 'changes' || (log === 'passed' && summaryListsTests(build));

// The poll's counts already decided the exit code, so a failed fetch keeps them and leaves the
// lists out instead of failing a completed build.
async function getResultTests(
  deps: Pick<Deps, 'client' | 'log'>,
  number: number,
  reportToken: string | undefined
): Promise<Partial<BuildTestsQueryResult['app']['build']>> {
  try {
    const data = await deps.client.runQuery<BuildTestsQueryResult>(
      SnapshotBuildTestsQuery,
      { number, limit: MAX_LISTED_TESTS },
      { headers: { Authorization: `Bearer ${reportToken}` } }
    );
    return data.app.build;
  } catch (err) {
    deps.log.debug(`Could not fetch the tests to list in the build result: ${err.message}`);
    return {};
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
  turboSnapOutcome: ctx.turboSnapOutcome,
});

export const applySnapshotOutput = (ctx: Context, output: SnapshotOutput) => {
  ctx.build = output.build;
  setExitCode(ctx, output.exitCode, output.userError);

  switch (output.log) {
    case 'passed':
      ctx.log.info(buildSummaryMessage(ctx));
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
