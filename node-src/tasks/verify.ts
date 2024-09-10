import { exitCodes, setExitCode } from '../lib/setExitCode';
import { createTask, transitionTo } from '../lib/tasks';
import { delay } from '../lib/utils';
import { Context, Task } from '../types';
import { endActivity, startActivity } from '../ui/components/activity';
import brokenStorybook from '../ui/messages/errors/brokenStorybook';
import listingStories from '../ui/messages/info/listingStories';
import storybookPublished from '../ui/messages/info/storybookPublished';
import turboSnapEnabled from '../ui/messages/info/turboSnapEnabled';
import buildLimited from '../ui/messages/warnings/buildLimited';
import paymentRequired from '../ui/messages/warnings/paymentRequired';
import snapshotQuotaReached from '../ui/messages/warnings/snapshotQuotaReached';
import turboSnapUnavailable from '../ui/messages/warnings/turboSnapUnavailable';
import {
  awaitingUpgrades,
  dryRun,
  initial,
  pending,
  publishFailed,
  runOnlyFiles,
  runOnlyNames,
  success,
} from '../ui/tasks/verify';

const PublishBuildMutation = `
  mutation PublishBuildMutation($id: ID!, $input: PublishBuildInput!) {
    publishBuild(id: $id, input: $input) {
      # no need for legacy:false on PublishedBuild.status
      status
      storybookUrl
    }
  }
`;
interface PublishBuildMutationResult {
  publishBuild: {
    status: string;
    storybookUrl: string;
  };
}

export const publishBuild = async (ctx: Context) => {
  const { turboSnap } = ctx;
  const { id, reportToken } = ctx.announcedBuild;
  const { replacementBuildIds } = ctx.git;
  const { onlyStoryNames, onlyStoryFiles = ctx.onlyStoryFiles } = ctx.options;

  let turboSnapBailReason;
  let turboSnapStatus = 'UNUSED';
  if (turboSnap) {
    turboSnapBailReason = turboSnap.bailReason;
    turboSnapStatus = turboSnap.bailReason ? 'BAILED' : 'APPLIED';
  }

  const { publishBuild: publishedBuild } = await ctx.client.runQuery<PublishBuildMutationResult>(
    PublishBuildMutation,
    {
      id,
      input: {
        ...(onlyStoryFiles && { onlyStoryFiles }),
        ...(onlyStoryNames && { onlyStoryNames: [].concat(onlyStoryNames) }),
        ...(replacementBuildIds && { replacementBuildIds }),
        // GraphQL does not support union input types (yet), so we send an object
        // @see https://github.com/graphql/graphql-spec/issues/488
        ...(turboSnapBailReason && { turboSnapBailReason }),
        turboSnapStatus,
      },
    },
    { headers: { Authorization: `Bearer ${reportToken}` }, retries: 3 }
  );

  ctx.announcedBuild = { ...ctx.announcedBuild, ...publishedBuild };
  ctx.storybookUrl = publishedBuild.storybookUrl;

  // Queueing the extract may have failed
  if (publishedBuild.status === 'FAILED') {
    setExitCode(ctx, exitCodes.BUILD_FAILED, false);
    throw new Error(publishFailed().output);
  }
};

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

export const verifyBuild = async (ctx: Context, task: Task) => {
  const { client } = ctx;
  const { list, onlyStoryNames, onlyStoryFiles = ctx.onlyStoryFiles } = ctx.options;
  const { matchesBranch } = ctx.git;

  // It's not possible to set both --only-changed and --only-story-files and/or --only-story-names
  // onlyStoryFiles may be passed directly, or calculated via --only-changed
  if (onlyStoryFiles) {
    transitionTo(runOnlyFiles)(ctx, task);
  }
  if (onlyStoryNames) {
    transitionTo(runOnlyNames)(ctx, task);
  }

  let timeoutStart = Date.now();
  const waitForBuildToStart = async () => {
    const { storybookUrl } = ctx;
    const { number, reportToken } = ctx.announcedBuild;
    const variables = { number };
    const options = { headers: { Authorization: `Bearer ${reportToken}` } };

    const {
      app: { build },
    } = await client.runQuery<StartedBuildQueryResult>(StartedBuildQuery, variables, options);

    if (build.failureReason) {
      ctx.log.warn(brokenStorybook({ failureReason: build.failureReason, storybookUrl }));
      setExitCode(ctx, exitCodes.STORYBOOK_BROKEN, true);
      throw new Error(publishFailed().output);
    }

    if (!build.startedAt) {
      // Upgrade builds can take a long time to complete, so we can't apply a hard timeout yet,
      // instead we only timeout on the actual build verification, after upgrades are complete.
      if (build.upgradeBuilds?.some((upgrade) => !upgrade.completedAt)) {
        task.output = awaitingUpgrades(ctx, build.upgradeBuilds).output;
        timeoutStart = Date.now() + ctx.env.CHROMATIC_POLL_INTERVAL;
      } else if (Date.now() - timeoutStart > ctx.env.STORYBOOK_VERIFY_TIMEOUT) {
        setExitCode(ctx, exitCodes.VERIFICATION_TIMEOUT);
        throw new Error('Build verification timed out');
      }

      await delay(ctx.env.CHROMATIC_POLL_INTERVAL);
      await waitForBuildToStart();
      return;
    }

    const {
      app: { build: startedBuild },
    } = await client.runQuery<VerifyBuildQueryResult>(VerifyBuildQuery, variables, options);
    ctx.build = { ...ctx.announcedBuild, ...ctx.build, ...startedBuild };
  };

  await Promise.race([
    waitForBuildToStart(),
    new Promise((_, reject) =>
      setTimeout(
        reject,
        ctx.env.CHROMATIC_UPGRADE_TIMEOUT,
        new Error('Timed out waiting for upgrade builds to complete')
      )
    ),
  ]);

  ctx.isPublishOnly = !ctx.build.features.uiReview && !ctx.build.features.uiTests;

  if (list) {
    ctx.log.info(listingStories(ctx.build.tests));
  }

  if (ctx.turboSnap) {
    if (ctx.turboSnap.unavailable) {
      ctx.log.warn(turboSnapUnavailable(ctx));
    } else if (ctx.build.turboSnapEnabled) {
      ctx.log.info(turboSnapEnabled(ctx));
    }
  }

  if (ctx.build.wasLimited) {
    const { account } = ctx.build.app;
    if (account.exceededThreshold) {
      ctx.log.warn(snapshotQuotaReached(account));
      setExitCode(ctx, exitCodes.ACCOUNT_QUOTA_REACHED, true);
    } else if (account.paymentRequired) {
      ctx.log.warn(paymentRequired(account));
      setExitCode(ctx, exitCodes.ACCOUNT_PAYMENT_REQUIRED, true);
    } else {
      // Future proofing for reasons we aren't aware of
      ctx.log.warn(buildLimited(account));
      setExitCode(ctx, exitCodes.BUILD_WAS_LIMITED, true);
    }
  }

  ctx.log.info(storybookPublished(ctx));

  transitionTo(success, true)(ctx, task);

  if (list || ctx.isPublishOnly || matchesBranch(ctx.options.exitOnceUploaded)) {
    setExitCode(ctx, exitCodes.OK);
    ctx.skipSnapshots = true;
  }
};

export default createTask({
  name: 'verify',
  title: initial.title,
  skip: (ctx: Context) => {
    if (ctx.skip) return true;
    if (ctx.options.dryRun) return dryRun().output;
    return false;
  },
  steps: [transitionTo(pending), startActivity, publishBuild, verifyBuild, endActivity],
});
