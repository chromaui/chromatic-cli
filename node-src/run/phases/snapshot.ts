import waitForBuildToComplete, {
  BuildProgressMessage,
  NotifyConnectionError,
  NotifyServiceAuthenticationError,
  NotifyServiceError,
  NotifyServiceMessageTimeoutError,
} from '@cli/waitForBuildToComplete';

import type { Environment } from '../../lib/getEnvironment';
import { Logger } from '../../lib/log';
import { Ports } from '../../lib/ports';
import { exitCodes } from '../../lib/setExitCode';
import { throttle } from '../../lib/utilities';
import type { Context, Options } from '../../types';
import buildHasChanges from '../../ui/messages/errors/buildHasChanges';
import buildHasErrors from '../../ui/messages/errors/buildHasErrors';
import buildPassedMessage from '../../ui/messages/info/buildPassed';
import speedUpCI from '../../ui/messages/info/speedUpCI';
import { pending } from '../../ui/tasks/snapshot';
import type { GitState, SnapshotState } from '../types';

export type SnapshotOutcome = 'passed' | 'has-changes' | 'broken' | 'failed' | 'cancelled';

export interface SnapshotExitCodeIntent {
  exitCode: number;
  userError: boolean;
}

export type SnapshotPhasePorts = Pick<Ports, 'chromatic' | 'clock' | 'errors' | 'ui'>;

export interface SnapshotProgressEvent {
  cursor: number;
  total: number;
  output: string;
}

export interface SnapshotPhaseInput {
  options: Options;
  env: Pick<
    Environment,
    'CHROMATIC_POLL_INTERVAL' | 'CHROMATIC_OUTPUT_INTERVAL' | 'CHROMATIC_NOTIFY_SERVICE_URL'
  >;
  git: Pick<GitState, 'matchesBranch'>;
  /** Verified build flowing in from the verify phase (mutated by polling). */
  build: Context['build'];
  /** Bytes uploaded by the upload phase, used to gate the speedUpCI hint. */
  uploadedBytes?: number;
  log: Logger;
  ports: SnapshotPhasePorts;
  /** Throttled progress callback consumed by the wrapping Listr task. */
  onProgress?: (event: SnapshotProgressEvent) => void;
}

export interface SnapshotPhaseOutput extends SnapshotState {
  outcome: SnapshotOutcome;
  exitCodeIntent: SnapshotExitCodeIntent;
}

/**
 * Pure orchestration of the `snapshot` phase. Subscribes to the notify
 * service for build-progress messages (with a polling fallback), polls
 * `getSnapshotBuild` until `completedAt` is set, and classifies the final
 * build status into a {@link SnapshotOutcome} plus an exit-code intent.
 *
 * @param input Phase inputs.
 *
 * @returns The {@link SnapshotState} slice plus the discriminated outcome
 * and the exit-code intent the caller should apply via `setExitCode`.
 */
// eslint-disable-next-line complexity
export async function runSnapshotPhase(input: SnapshotPhaseInput): Promise<SnapshotPhaseOutput> {
  const { app, tests, testCount, actualTestCount, reportToken } = input.build;

  if (app.repository && input.uploadedBytes && !input.options.junitReport) {
    input.log.info(speedUpCI(app.repository.provider));
  }

  const testLabels =
    input.options.interactive &&
    testCount === actualTestCount &&
    tests?.map(({ spec, parameters, mode }) => {
      const testSuffixName = mode.name || `[${parameters.viewport}px]`;
      const suffix = parameters.viewportIsDefault ? '' : testSuffixName;
      return `${spec.component.displayName} › ${spec.name} ${suffix}`;
    });

  const updateProgress = throttle(
    ({ cursor, label }: { cursor: number; label: string }) => {
      const output = pending(makeLegacyContext(input, current), { cursor, label }).output;
      input.ports.ui.taskUpdate({ output });
      input.onProgress?.({ cursor, total: actualTestCount, output });
      input.options.experimental_onTaskProgress?.(makeLegacyContext(input, current), {
        progress: cursor,
        total: actualTestCount,
        unit: 'snapshots',
      });
    },
    // Avoid spamming the logs with progress updates in non-interactive mode.
    input.options.interactive
      ? input.env.CHROMATIC_POLL_INTERVAL
      : input.env.CHROMATIC_OUTPUT_INTERVAL
  );

  let current = input.build;

  const projectProgress = (data: BuildProgressMessage | Context['build']): void => {
    if (actualTestCount > 0) {
      const { inProgressCount = 0 } = data;
      const cursor = actualTestCount - inProgressCount + 1;
      const label = (testLabels && testLabels[cursor - 1]) || '';
      updateProgress({ cursor, label });
    }
  };

  if (actualTestCount > 0) {
    await subscribeToNotify(input, reportToken, projectProgress);
  }

  current = await pollUntilCompleted(input, current, projectProgress);
  const outcome = classifyOutcome(input, current);
  const exitCodeIntent = mapExitCode(input, current, outcome);
  if (
    outcome === 'passed' ||
    (outcome === 'has-changes' && exitCodeIntent.exitCode === exitCodes.OK)
  ) {
    input.log.info(buildPassedMessage(makeLegacyContext(input, current)));
  } else if (outcome === 'has-changes') {
    input.log.error(buildHasChanges(makeLegacyContext(input, current)));
  } else if (outcome === 'broken') {
    input.log.error(buildHasErrors(makeLegacyContext(input, current)));
  }

  return { build: current, outcome, exitCodeIntent };
}

async function pollUntilCompleted(
  input: SnapshotPhaseInput,
  build: Context['build'],
  onProgress: (data: Context['build']) => void
): Promise<Context['build']> {
  const { number, reportToken } = build;
  let current = build;
  while (!current.completedAt) {
    const data = await input.ports.chromatic.getSnapshotBuild({ number }, { reportToken });
    current = { ...current, ...data } as Context['build'];
    if (current.completedAt) break;
    onProgress(current);
    await input.ports.clock.sleep(input.env.CHROMATIC_POLL_INTERVAL);
  }
  return current;
}

async function subscribeToNotify(
  input: SnapshotPhaseInput,
  reportToken: string | undefined,
  uiStateUpdater: (data: BuildProgressMessage | Context['build']) => void
): Promise<void> {
  try {
    await waitForBuildToComplete({
      notifyServiceUrl: input.env.CHROMATIC_NOTIFY_SERVICE_URL,
      buildId: input.build.id,
      progressMessageCallback: uiStateUpdater,
      log: input.log,
      headers: { Authorization: `Bearer ${reportToken}` },
    });
  } catch (error) {
    input.ports.errors.captureException(error);
    if (error instanceof NotifyConnectionError) {
      input.log.debug(
        `Failed to connect to notify service, falling back to polling: code: ${error.statusCode}, original error: ${error.originalError?.message}`
      );
    } else if (error instanceof NotifyServiceMessageTimeoutError) {
      input.log.debug('Timed out waiting for message from notify service, falling back to polling');
    } else if (error instanceof NotifyServiceAuthenticationError) {
      input.log.debug(
        `Error authenticating with notify service: ${error.statusCode} ${error.message}`
      );
    } else if (error instanceof NotifyServiceError) {
      input.log.debug(
        `Error getting updates from notify service: ${error.message} code: ${error.statusCode}, reason: ${error.reason}, original error: ${error.originalError?.message}`
      );
    } else {
      input.log.error(`Unexpected error from notify service: ${(error as Error).message}`);
    }
  }
}

function classifyOutcome(_input: SnapshotPhaseInput, build: Context['build']): SnapshotOutcome {
  switch (build.status) {
    case 'PASSED':
      return 'passed';
    case 'ACCEPTED':
    case 'PENDING':
    case 'DENIED':
      return 'has-changes';
    case 'BROKEN':
      return 'broken';
    case 'FAILED':
      return 'failed';
    case 'CANCELLED':
      return 'cancelled';
    default:
      throw new Error(`Unexpected build status: ${build.status}`);
  }
}

// eslint-disable-next-line complexity
function mapExitCode(
  input: SnapshotPhaseInput,
  build: Context['build'],
  outcome: SnapshotOutcome
): SnapshotExitCodeIntent {
  switch (outcome) {
    case 'passed':
      return { exitCode: exitCodes.OK, userError: false };
    case 'has-changes': {
      const passes =
        build.autoAcceptChanges ||
        // The boolean version of this check is handled by ctx.git.matchesBranch
        input.options?.exitZeroOnChanges === 'true' ||
        !!input.git.matchesBranch?.(input.options?.exitZeroOnChanges || false);
      return passes
        ? { exitCode: exitCodes.OK, userError: false }
        : { exitCode: exitCodes.BUILD_HAS_CHANGES, userError: true };
    }
    case 'broken':
      return { exitCode: exitCodes.BUILD_HAS_ERRORS, userError: true };
    case 'failed':
      return { exitCode: exitCodes.BUILD_FAILED, userError: false };
    case 'cancelled':
      return { exitCode: exitCodes.BUILD_WAS_CANCELED, userError: true };
    default:
      throw new Error(`Unhandled snapshot outcome: ${outcome as string}`);
  }
}

/**
 * Synthesize a Context-shaped argument for the legacy snapshot UI message
 * renderers (`pending`, `buildPassedMessage`, `buildHasChanges`, etc.).
 *
 * @param input Phase inputs.
 * @param build The build to project (in-progress or completed).
 *
 * @returns A Context-shaped value with the fields the renderers read.
 */
function makeLegacyContext(input: SnapshotPhaseInput, build: Context['build']): Context {
  return {
    log: input.log,
    options: input.options,
    git: input.git,
    build,
  } as unknown as Context;
}
