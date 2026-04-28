import type { Environment } from '../../lib/getEnvironment';
import { Logger } from '../../lib/log';
import { Ports } from '../../lib/ports';
import { exitCodes } from '../../lib/setExitCode';
import type { Context, Options, TurboSnap } from '../../types';
import brokenStorybook from '../../ui/messages/errors/brokenStorybook';
import listingStories from '../../ui/messages/info/listingStories';
import storybookPublished from '../../ui/messages/info/storybookPublished';
import turboSnapEnabled from '../../ui/messages/info/turboSnapEnabled';
import buildLimited from '../../ui/messages/warnings/buildLimited';
import paymentRequired from '../../ui/messages/warnings/paymentRequired';
import snapshotQuotaReached from '../../ui/messages/warnings/snapshotQuotaReached';
import turboSnapUnavailable from '../../ui/messages/warnings/turboSnapUnavailable';
import { awaitingUpgrades, publishFailed } from '../../ui/tasks/verify';
import type { GitState, VerifiedState } from '../types';

/**
 * Error thrown by {@link runVerifyPhase} on a known failure mode. Carries the
 * exit code (and userError flag) the orchestrator should set on the way out.
 */
export class VerifyPhaseError extends Error {
  readonly exitCode: number;
  readonly userError: boolean;
  constructor(message: string, exitCode: number, userError = false) {
    super(message);
    this.name = 'VerifyPhaseError';
    this.exitCode = exitCode;
    this.userError = userError;
  }
}

/**
 * Non-throw exit-code intent emitted alongside {@link VerifyPhaseOutput}.
 * The wrapping Listr task calls `setExitCode` with these values; the run
 * still completes successfully but with the indicated exit code.
 */
export interface VerifyExitCodeIntent {
  exitCode: number;
  userError: boolean;
}

export type VerifyPhasePorts = Pick<Ports, 'chromatic' | 'clock' | 'ui'>;

export interface VerifyPhaseInput {
  options: Options;
  env: Pick<
    Environment,
    'CHROMATIC_POLL_INTERVAL' | 'CHROMATIC_UPGRADE_TIMEOUT' | 'STORYBOOK_VERIFY_TIMEOUT'
  >;
  git: Pick<GitState, 'matchesBranch' | 'replacementBuildIds'>;
  storybook: Context['storybook'];
  announcedBuild: Context['announcedBuild'];
  turboSnap?: TurboSnap;
  /** Story files the prepare phase narrowed down via TurboSnap, when applicable. */
  onlyStoryFiles?: string[];
  log: Logger;
  ports: VerifyPhasePorts;
}

export interface VerifyPhaseOutput extends VerifiedState {
  /** Optional non-throw exit-code intent (e.g. publish-only, build limited). */
  exitCodeIntent?: VerifyExitCodeIntent;
}

/**
 * Pure orchestration of the `verify` phase. Publishes the announced build,
 * polls for the build to start, and classifies the resulting state into a
 * `VerifiedState` slice plus an optional non-throw exit-code intent (or
 * throws {@link VerifyPhaseError} for known failure modes).
 *
 * @param input Phase inputs.
 *
 * @returns The {@link VerifiedState} plus an optional `exitCodeIntent` the
 * caller should apply via `setExitCode`.
 */
// eslint-disable-next-line complexity
export async function runVerifyPhase(input: VerifyPhaseInput): Promise<VerifyPhaseOutput> {
  const announcedBuild = await publish(input);
  const storybookUrl = (announcedBuild as { storybookUrl?: string }).storybookUrl ?? '';
  const build = await waitForBuild({ ...input, announcedBuild, storybookUrl });

  const isPublishOnly = !build.features?.uiReview && !build.features?.uiTests;

  if (input.options.list && build.tests) {
    input.log.info(listingStories(build.tests));
  }

  if (input.turboSnap) {
    if (input.turboSnap.unavailable) {
      input.log.warn(turboSnapUnavailable(makeLegacyContext(input, build, storybookUrl)));
    } else if (build.turboSnapEnabled) {
      input.log.info(turboSnapEnabled(makeLegacyContext(input, build, storybookUrl)));
    }
  }

  const limitedIntent = classifyLimited(input, build);

  if (storybookUrl) {
    input.log.info(storybookPublished(makeLegacyContext(input, build, storybookUrl)));
  }

  const skipSnapshots =
    !!input.options.list ||
    isPublishOnly ||
    !!input.git.matchesBranch?.(input.options.exitOnceUploaded);

  const exitCodeIntent =
    limitedIntent ?? (skipSnapshots ? { exitCode: exitCodes.OK, userError: false } : undefined);

  return {
    announcedBuild,
    build,
    storybookUrl,
    skipSnapshots: skipSnapshots || undefined,
    isPublishOnly,
    exitCodeIntent,
  };
}

function computeTurboSnapStatus(turboSnap: TurboSnap | undefined): 'UNUSED' | 'APPLIED' | 'BAILED' {
  if (!turboSnap) return 'UNUSED';
  return turboSnap.bailReason ? 'BAILED' : 'APPLIED';
}

async function publish(input: VerifyPhaseInput): Promise<Context['announcedBuild']> {
  const { id, reportToken } = input.announcedBuild;
  const { onlyStoryNames } = input.options;
  const onlyStoryFiles = input.options.onlyStoryFiles ?? input.onlyStoryFiles;

  const turboSnapBailReason = input.turboSnap?.bailReason;
  const turboSnapStatus = computeTurboSnapStatus(input.turboSnap);

  const publishedBuild = await input.ports.chromatic.publishBuild(
    {
      id,
      input: {
        ...(onlyStoryFiles && { onlyStoryFiles }),
        ...(onlyStoryNames && { onlyStoryNames: [onlyStoryNames].flat() }),
        ...(input.git.replacementBuildIds && {
          replacementBuildIds: input.git.replacementBuildIds,
        }),
        // GraphQL does not support union input types (yet), so we send an object
        // @see https://github.com/graphql/graphql-spec/issues/488
        ...(turboSnapBailReason && { turboSnapBailReason }),
        turboSnapStatus,
      },
    },
    { reportToken }
  );

  if (publishedBuild.status === 'FAILED') {
    throw new VerifyPhaseError(
      publishFailed({
        options: input.options,
        isReactNativeApp: false,
        announcedBuild: input.announcedBuild,
      } as unknown as Context).output,
      exitCodes.BUILD_FAILED
    );
  }

  return { ...input.announcedBuild, ...publishedBuild };
}

async function waitForBuild(
  input: VerifyPhaseInput & { announcedBuild: Context['announcedBuild']; storybookUrl: string }
): Promise<Context['build']> {
  let timeoutStart = input.ports.clock.now();
  const { number, reportToken } = input.announcedBuild;

  const poll = async (): Promise<Context['build']> => {
    const polled = await input.ports.chromatic.getStartedBuild({ number }, { reportToken });

    if (polled.failureReason) {
      input.log.warn(
        brokenStorybook(
          { announcedBuild: input.announcedBuild, storybookUrl: input.storybookUrl } as Context,
          { failureReason: polled.failureReason, storybookUrl: input.storybookUrl }
        )
      );
      throw new VerifyPhaseError(
        publishFailed({
          options: input.options,
          isReactNativeApp: false,
          announcedBuild: input.announcedBuild,
        } as unknown as Context).output,
        exitCodes.STORYBOOK_BROKEN,
        true
      );
    }

    if (!polled.startedAt) {
      // Upgrade builds can take a long time to complete, so we can't apply a
      // hard timeout yet — only timeout on actual build verification once
      // upgrades are complete.
      if (polled.upgradeBuilds?.some((upgrade) => !upgrade.completedAt)) {
        input.ports.ui.taskUpdate({
          output: awaitingUpgrades(
            makeLegacyContext(input, undefined, input.storybookUrl),
            polled.upgradeBuilds
          ).output,
        });
        timeoutStart = input.ports.clock.now() + input.env.CHROMATIC_POLL_INTERVAL;
      } else if (input.ports.clock.since(timeoutStart) > input.env.STORYBOOK_VERIFY_TIMEOUT) {
        throw new VerifyPhaseError('Build verification timed out', exitCodes.VERIFICATION_TIMEOUT);
      }

      await input.ports.clock.sleep(input.env.CHROMATIC_POLL_INTERVAL);
      return poll();
    }

    const verified = await input.ports.chromatic.verifyBuild({ number }, { reportToken });
    return { ...input.announcedBuild, ...verified } as unknown as Context['build'];
  };

  return Promise.race([
    poll(),
    input.ports.clock.sleep(input.env.CHROMATIC_UPGRADE_TIMEOUT).then(() => {
      throw new Error('Timed out waiting for upgrade builds to complete');
    }),
  ]);
}

function classifyLimited(
  input: VerifyPhaseInput,
  build: Context['build']
): VerifyExitCodeIntent | undefined {
  if (!build.wasLimited) return undefined;
  const { account } = build.app;
  if (account?.exceededThreshold) {
    input.log.warn(snapshotQuotaReached(account));
    return { exitCode: exitCodes.ACCOUNT_QUOTA_REACHED, userError: true };
  }
  if (account?.paymentRequired) {
    input.log.warn(paymentRequired(account));
    return { exitCode: exitCodes.ACCOUNT_PAYMENT_REQUIRED, userError: true };
  }
  // Future-proof for reasons we are not aware of.
  if (account) input.log.warn(buildLimited(account));
  return { exitCode: exitCodes.BUILD_WAS_LIMITED, userError: true };
}

/**
 * Synthesize a Context-shaped argument for the legacy message renderers
 * (`storybookPublished`, `turboSnapEnabled`, `awaitingUpgrades`, …) which
 * still expect to read assorted ctx fields directly.
 *
 * @param input The phase input.
 * @param build The verified build (omit while the build has not started yet).
 * @param storybookUrl The published Storybook URL.
 *
 * @returns A Context-shaped value with the fields the renderers read.
 */
function makeLegacyContext(
  input: VerifyPhaseInput,
  build: Context['build'] | undefined,
  storybookUrl: string
): Context {
  return {
    options: input.options,
    log: input.log,
    storybook: input.storybook,
    git: input.git,
    announcedBuild: input.announcedBuild,
    build,
    storybookUrl,
    turboSnap: input.turboSnap,
  } as unknown as Context;
}
