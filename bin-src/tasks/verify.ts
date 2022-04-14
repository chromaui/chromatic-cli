import { exitCodes, setExitCode } from '../lib/setExitCode';
import { createTask, transitionTo } from '../lib/tasks';
import listingStories from '../ui/messages/info/listingStories';
import storybookPublished from '../ui/messages/info/storybookPublished';
import buildLimited from '../ui/messages/warnings/buildLimited';
import noAncestorBuild from '../ui/messages/warnings/noAncestorBuild';
import paymentRequired from '../ui/messages/warnings/paymentRequired';
import snapshotQuotaReached from '../ui/messages/warnings/snapshotQuotaReached';
import { initial, dryRun, pending, runOnly, runOnlyFiles, success } from '../ui/tasks/verify';
import turboSnapEnabled from '../ui/messages/info/turboSnapEnabled';
import { Context, Task } from '../types';

const CreateBuildMutation = `
  mutation CreateBuildMutation($input: CreateBuildInput!, $isolatorUrl: String!) {
    createBuild(input: $input, isolatorUrl: $isolatorUrl) {
      id
      number
      status
      specCount
      componentCount
      testCount
      changeCount
      errorCount: testCount(statuses: [BROKEN])
      actualTestCount: testCount(statuses: [IN_PROGRESS])
      actualCaptureCount
      inheritedCaptureCount
      webUrl
      cachedUrl
      reportToken
      browsers {
        browser
      }
      features {
        uiTests
        uiReview
      }
      autoAcceptChanges
      wasLimited
      app {
        account {
          exceededThreshold
          paymentRequired
          billingUrl
        }
        repository {
          provider
        }
        setupUrl
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
      }
    }
  }
`;
interface CreateBuildMutationResult {
  createBuild: {
    id: string;
    number: number;
    status: string;
    specCount: number;
    componentCount: number;
    testCount: number;
    changeCount: number;
    errorCount: number;
    actualTestCount: number;
    actualCaptureCount: number;
    inheritedCaptureCount: number;
    webUrl: string;
    cachedUrl: string;
    reportToken: string;
    browsers: {
      browser: string;
    }[];
    features: {
      uiTests: boolean;
      uiReview: boolean;
    };
    autoAcceptChanges: boolean;
    wasLimited: boolean;
    app: {
      account: {
        exceededThreshold: boolean;
        paymentRequired: boolean;
        billingUrl: string;
      };
      repository: {
        provider: string;
      };
      setupUrl: string;
    };
    tests: {
      spec: {
        name: string;
        component: {
          name: string;
          displayName: string;
        };
      };
      parameters: {
        viewport: number;
        viewportIsDefault: boolean;
      };
    }[];
  };
}

export const setEnvironment = async (ctx: Context) => {
  // We send up all environment variables provided by these complicated systems.
  // We don't want to send up *all* environment vars as they could include sensitive information
  // about the user's build environment
  ctx.environment = JSON.stringify(
    Object.entries(process.env).reduce((acc, [key, value]) => {
      if (ctx.env.ENVIRONMENT_WHITELIST.find((regex) => key.match(regex))) {
        acc[key] = value;
      }
      return acc;
    }, {})
  );

  ctx.log.debug(`Got environment ${ctx.environment}`);
};

export const createBuild = async (ctx: Context, task: Task) => {
  const { list, only, patchBaseRef, patchHeadRef, preserveMissingSpecs } = ctx.options;
  const { version, matchesBranch, changedFiles, mergeCommit, ...commitInfo } = ctx.git; // omit some fields
  const { isolatorUrl, rebuildForBuildId, onlyStoryFiles, turboSnap } = ctx;
  const autoAcceptChanges = matchesBranch(ctx.options.autoAcceptChanges);

  // It's not possible to set both --only and --only-changed
  if (only) {
    transitionTo(runOnly)(ctx, task);
  }
  if (onlyStoryFiles) {
    transitionTo(runOnlyFiles)(ctx, task);
  }

  const { createBuild: build } = await ctx.client.runQuery<CreateBuildMutationResult>(
    CreateBuildMutation,
    {
      input: {
        ...commitInfo,
        rebuildForBuildId,
        ...(only && { only }),
        ...(onlyStoryFiles && { onlyStoryFiles: Object.keys(onlyStoryFiles) }),
        ...(turboSnap && { turboSnapEnabled: !turboSnap.bailReason }),
        // GraphQL does not support union input types (yet), so we stringify the bailReason
        // @see https://github.com/graphql/graphql-spec/issues/488
        ...(turboSnap &&
          turboSnap.bailReason && { turboSnapBailReason: JSON.stringify(turboSnap.bailReason) }),
        autoAcceptChanges,
        cachedUrl: ctx.cachedUrl,
        environment: ctx.environment,
        patchBaseRef,
        patchHeadRef,
        preserveMissingSpecs,
        packageVersion: ctx.pkg.version,
        storybookVersion: ctx.storybook.version,
        viewLayer: ctx.storybook.viewLayer,
        addons: ctx.storybook.addons,
      },
      isolatorUrl,
    },
    { retries: 3 }
  );

  ctx.build = build;
  ctx.isPublishOnly = !build.features.uiReview && !build.features.uiTests;
  ctx.isOnboarding = build.number === 1 || (build.autoAcceptChanges && !autoAcceptChanges);

  if (list) {
    ctx.log.info(listingStories(build.tests));
  }

  if (!ctx.isOnboarding && !ctx.git.parentCommits) {
    ctx.log.warn(noAncestorBuild(ctx));
  }

  if (ctx.turboSnap && !ctx.turboSnap.bailReason) {
    ctx.log.info(turboSnapEnabled(ctx));
  }

  if (build.wasLimited) {
    const { account } = build.app;
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

  transitionTo(success, true)(ctx, task);

  if (list || ctx.isPublishOnly || matchesBranch(ctx.options.exitOnceUploaded)) {
    setExitCode(ctx, exitCodes.OK);
    ctx.skipSnapshots = true;
    ctx.log.info(storybookPublished(ctx));
  }
};

export default createTask({
  title: initial.title,
  skip: (ctx: Context) => {
    if (ctx.skip) return true;
    if (ctx.options.dryRun) return dryRun().output;
    return false;
  },
  steps: [transitionTo(pending), setEnvironment, createBuild],
});
