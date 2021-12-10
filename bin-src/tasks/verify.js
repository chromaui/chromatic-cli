import retry from 'async-retry';
import { createTask, transitionTo } from '../lib/tasks';
import listingStories from '../ui/messages/info/listingStories';
import storybookPublished from '../ui/messages/info/storybookPublished';
import buildLimited from '../ui/messages/warnings/buildLimited';
import paymentRequired from '../ui/messages/warnings/paymentRequired';
import snapshotQuotaReached from '../ui/messages/warnings/snapshotQuotaReached';
import { initial, dryRun, pending, runOnly, runOnlyFiles, success } from '../ui/tasks/verify';

const TesterCreateBuildMutation = `
  mutation TesterCreateBuildMutation($input: CreateBuildInput!, $isolatorUrl: String!) {
    createBuild(input: $input, isolatorUrl: $isolatorUrl) {
      id
      number
      specCount
      componentCount
      testCount
      actualTestCount: testCount(statuses: [IN_PROGRESS])
      actualCaptureCount
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

// Some errors from the Chromatic backend are expected. This holds these values so the query can
// retry as necessary.
const retryableErrors = ['Build was not inserted in time'];

// Calls the Chromatic backend to create a new build for verification
const createBuildOnChromatic = async (ctx, createBuildOptions) => {
  const { client, log } = ctx;

  return retry(
    async (bail) => {
      let res;

      try {
        res = await client.runQuery(TesterCreateBuildMutation, createBuildOptions);
      } catch (err) {
        // if it's an expected error, simply retry
        if (retryableErrors.includes(err.message)) {
          log.debug({ err }, 'Received a retryable error, retrying');
          throw err;
        }

        bail(err);
      }

      return res;
    },
    { retries: 3 }
  );
};

export const setEnvironment = async (ctx) => {
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

export const createBuild = async (ctx, task) => {
  const { git, log, isolatorUrl, options, onlyStoryFiles } = ctx;
  const { list, only, patchBaseRef, patchHeadRef, preserveMissingSpecs } = options;
  const { version, matchesBranch, changedFiles, ...commitInfo } = git; // omit some fields
  const autoAcceptChanges = matchesBranch(options.autoAcceptChanges);

  // It's not possible to set both --only and --only-changed
  if (only) {
    transitionTo(runOnly)(ctx, task);
  }
  if (onlyStoryFiles) {
    transitionTo(runOnlyFiles)(ctx, task);
  }

  const { createBuild: build } = await createBuildOnChromatic(ctx, {
    input: {
      ...commitInfo,
      ...(only && { only }),
      ...(onlyStoryFiles && { onlyStoryFiles: Object.keys(onlyStoryFiles) }),
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
  });

  ctx.build = build;
  ctx.isPublishOnly = !build.features.uiReview && !build.features.uiTests;
  ctx.isOnboarding = build.number === 1 || (build.autoAcceptChanges && !autoAcceptChanges);

  if (list) {
    log.info(listingStories(build.tests));
  }

  if (build.wasLimited) {
    const { account } = build.app;
    if (account.exceededThreshold) {
      log.warn(snapshotQuotaReached(account));
      ctx.exitCode = 101;
    } else if (account.paymentRequired) {
      log.warn(paymentRequired(account));
      ctx.exitCode = 102;
    } else {
      // Future proofing for reasons we aren't aware of
      log.warn(buildLimited(account));
      ctx.exitCode = 100;
    }
  }

  transitionTo(success, true)(ctx, task);

  if (list || ctx.isPublishOnly || matchesBranch(options.exitOnceUploaded)) {
    ctx.exitCode = 0;
    ctx.skipSnapshots = true;
    ctx.log.info(storybookPublished(ctx));
  }
};

export default createTask({
  title: initial.title,
  skip: (ctx) => {
    if (ctx.skip) return true;
    if (ctx.options.dryRun) return dryRun(ctx).output;
    return false;
  },
  steps: [transitionTo(pending), setEnvironment, createBuild],
});
