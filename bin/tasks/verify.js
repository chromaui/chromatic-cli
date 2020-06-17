import { createTask, transitionTo } from '../lib/tasks';
import listingStories from '../ui/messages/info/listingStories';
import storybookPublished from '../ui/messages/info/storybookPublished';
import buildLimited from '../ui/messages/warnings/buildLimited';
import paymentRequired from '../ui/messages/warnings/paymentRequired';
import snapshotQuotaReached from '../ui/messages/warnings/snapshotQuotaReached';
import { initial, pending, runOnly, success } from '../ui/tasks/verify';

const TesterCreateBuildMutation = `
  mutation TesterCreateBuildMutation($input: CreateBuildInput!, $isolatorUrl: String!) {
    createBuild(input: $input, isolatorUrl: $isolatorUrl) {
      id
      number
      specCount
      snapshotCount
      componentCount
      webUrl
      cachedUrl
      reportToken
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
      snapshots {
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

export const setEnvironment = async ctx => {
  // We send up all environment variables provided by these complicated systems.
  // We don't want to send up *all* environment vars as they could include sensitive information
  // about the user's build environment
  ctx.environment = JSON.stringify(
    Object.entries(process.env).reduce((acc, [key, value]) => {
      if (ctx.env.ENVIRONMENT_WHITELIST.find(regex => key.match(regex))) {
        acc[key] = value;
      }
      return acc;
    }, {})
  );

  ctx.log.debug(`Got environment ${ctx.environment}`);
};

export const createBuild = async (ctx, task) => {
  const { client, environment, git, log, pkg, cachedUrl, isolatorUrl, options } = ctx;
  const { list, only, patchBaseRef, patchHeadRef, preserveMissingSpecs } = options;
  const { version, matchesBranch, ...commitInfo } = git; // omit some fields
  const autoAcceptChanges = matchesBranch(options.autoAcceptChanges);

  if (only) {
    transitionTo(runOnly)(ctx, task);
  }

  const { createBuild: build } = await client.runQuery(TesterCreateBuildMutation, {
    input: {
      ...commitInfo,
      ...(only && { only }),
      autoAcceptChanges,
      cachedUrl,
      environment,
      patchBaseRef,
      patchHeadRef,
      preserveMissingSpecs,
      packageVersion: pkg.version,
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
    log.info(listingStories(build.snapshots));
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
  skip: ctx => ctx.skip,
  steps: [transitionTo(pending), setEnvironment, createBuild],
});
