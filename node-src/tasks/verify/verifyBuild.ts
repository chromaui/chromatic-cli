import { exitCodes, TaskFailure } from '../../lib/setExitCode';
import { delay } from '../../lib/utilities';
import { Context, Deps } from '../../types';
import brokenStorybook from '../../ui/messages/errors/brokenStorybook';
import listingStories from '../../ui/messages/info/listingStories';
import storybookPublished from '../../ui/messages/info/storybookPublished';
import turboSnapEnabled from '../../ui/messages/info/turboSnapEnabled';
import buildLimited from '../../ui/messages/warnings/buildLimited';
import paymentRequired from '../../ui/messages/warnings/paymentRequired';
import snapshotQuotaReached from '../../ui/messages/warnings/snapshotQuotaReached';
import turboSnapUnavailable from '../../ui/messages/warnings/turboSnapUnavailable';
import { awaitingUpgrades, publishFailed, runOnlyFiles, runOnlyNames } from '../../ui/tasks/verify';

const StartedBuildQuery = `
  query StartedBuildQuery($number: Int!) {
    app {
      build(number: $number) {
        startedAt
        failureReason
        upgradeBuilds {
          completedAt
        }
      }
    }
  }
`;

interface StartedBuildQueryResult {
  app: {
    build: {
      startedAt?: number;
      failureReason?: string;
      upgradeBuilds?: {
        completedAt?: number;
      }[];
    };
  };
}

// these fields must be part of authorizedBuildFieldsViaAppCode in the public api
const VerifyBuildQuery = `
  query VerifyBuildQuery($number: Int!) {
    app {
      build(number: $number) {
        id
        number
        status(legacy: false)
        specCount
        componentCount
        testCount
        changeCount
        errorCount: testCount(statuses: [BROKEN])
        actualTestCount: testCount(statuses: [IN_PROGRESS])
        actualCaptureCount
        inheritedCaptureCount
        interactionTestFailuresCount
        webUrl
        browsers {
          browser
        }
        features {
          uiTests
          uiReview
          isReactNativeApp
        }
        autoAcceptChanges
        turboSnapEnabled
        wasLimited
        app {
          manageUrl
          setupUrl
          account {
            exceededThreshold
            paymentRequired
            billingUrl
          }
          repository {
            provider
          }
        }
        tests {
          spec {
            name
            component {
              name
              displayName
            }
          }
          parameters {
            viewport
            viewportIsDefault
          }
          mode {
            name
          }
        }
      }
    }
  }
`;

interface VerifyBuildQueryResult {
  app: {
    build: Context['build'];
  };
}

export interface VerifyBuildInput {
  announcedBuild: Context['announcedBuild'];
  build: Context['build'];
  storybookUrl?: string;
  options: Context['options'];
  onlyStoryFiles?: string[];
  matchesBranch?: Context['git']['matchesBranch'];
  turboSnap?: Context['turboSnap'];
  isReactNativeApp?: boolean;
}

export interface VerifyBuildResult {
  build: Context['build'];
  isPublishOnly: boolean;
  skipSnapshots: boolean;
  // A non-throwing exit code set when the build was limited (quota/payment/other), applied to ctx
  // in `applyVerifyOutput`. `run` has no ctx to call `setExitCode` directly.
  limitExitCode?: { code: number; userError: boolean };
}

// TODO: refactor this function
/* eslint-disable complexity, max-statements */
export const verifyBuild = async (
  deps: Deps,
  input: VerifyBuildInput
): Promise<VerifyBuildResult> => {
  const { client, env, log, report } = deps;
  const { announcedBuild, storybookUrl, turboSnap, matchesBranch } = input;
  const { list, onlyStoryNames, onlyStoryFiles = input.onlyStoryFiles } = input.options;

  // It's not possible to set both --only-changed and --only-story-files and/or --only-story-names
  // onlyStoryFiles may be passed directly, or calculated via --only-changed
  if (onlyStoryFiles) {
    report(runOnlyFiles(input));
  }
  if (onlyStoryNames) {
    report(runOnlyNames(input));
  }

  let build = input.build;
  let timeoutStart = Date.now();
  const waitForBuildToStart = async () => {
    const { number, reportToken } = announcedBuild;
    const variables = { number };
    const options = { headers: { Authorization: `Bearer ${reportToken}` } };

    const {
      app: { build: startedInfo },
    } = await client.runQuery<StartedBuildQueryResult>(StartedBuildQuery, variables, options);

    if (startedInfo.failureReason) {
      log.warn(brokenStorybook(input, { failureReason: startedInfo.failureReason, storybookUrl }));
      throw new TaskFailure(publishFailed(input).output, {
        exitCode: exitCodes.STORYBOOK_BROKEN,
        userError: true,
      });
    }

    if (!startedInfo.startedAt) {
      // Upgrade builds can take a long time to complete, so we can't apply a hard timeout yet,
      // instead we only timeout on the actual build verification, after upgrades are complete.
      if (startedInfo.upgradeBuilds?.some((upgrade) => !upgrade.completedAt)) {
        report({ output: awaitingUpgrades(input, startedInfo.upgradeBuilds).output });
        timeoutStart = Date.now() + env.CHROMATIC_POLL_INTERVAL;
      } else if (Date.now() - timeoutStart > env.STORYBOOK_VERIFY_TIMEOUT) {
        throw new TaskFailure('Build verification timed out', {
          exitCode: exitCodes.VERIFICATION_TIMEOUT,
        });
      }

      await delay(env.CHROMATIC_POLL_INTERVAL);
      await waitForBuildToStart();
      return;
    }

    const {
      app: { build: startedBuild },
    } = await client.runQuery<VerifyBuildQueryResult>(VerifyBuildQuery, variables, options);
    build = { ...announcedBuild, ...build, ...startedBuild };
  };

  await Promise.race([
    waitForBuildToStart(),
    new Promise((_, reject) =>
      setTimeout(
        reject,
        env.CHROMATIC_UPGRADE_TIMEOUT,
        new Error('Timed out waiting for upgrade builds to complete')
      )
    ),
  ]);

  const isPublishOnly = !build.features?.uiReview && !build.features?.uiTests;

  if (list && build.tests) {
    log.info(listingStories(build.tests));
  }

  if (turboSnap) {
    if (turboSnap.unavailable) {
      log.warn(turboSnapUnavailable({ build }));
    } else if (build.turboSnapEnabled) {
      log.info(turboSnapEnabled({ build, options: input.options }));
    }
  }

  let limitExitCode: VerifyBuildResult['limitExitCode'];
  if (build.wasLimited) {
    const { account } = build.app;
    if (account?.exceededThreshold) {
      log.warn(snapshotQuotaReached(account));
      limitExitCode = { code: exitCodes.ACCOUNT_QUOTA_REACHED, userError: true };
    } else if (account?.paymentRequired) {
      log.warn(paymentRequired(account));
      limitExitCode = { code: exitCodes.ACCOUNT_PAYMENT_REQUIRED, userError: true };
    } else {
      // Future proofing for reasons we aren't aware of
      if (account) {
        log.warn(buildLimited(account));
      }
      limitExitCode = { code: exitCodes.BUILD_WAS_LIMITED, userError: true };
    }
  }

  if (build && storybookUrl) {
    log.info(
      storybookPublished({
        storybookUrl,
        build,
        options: input.options,
        isReactNativeApp: input.isReactNativeApp,
      })
    );
  }

  const skipSnapshots = !!(
    list ||
    isPublishOnly ||
    matchesBranch?.(input.options.exitOnceUploaded)
  );

  return { build, isPublishOnly, skipSnapshots, limitExitCode };
};
/* eslint-enable complexity, max-statements */
