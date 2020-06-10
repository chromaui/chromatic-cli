import { createTask, transitionTo } from '../lib/tasks';
import { matchesBranch } from '../lib/utils';
import listingStories from '../ui/messages/info/listingStories';
import buildLimited from '../ui/messages/warnings/buildLimited';
import paymentRequired from '../ui/messages/warnings/paymentRequired';
import snapshotQuotaReached from '../ui/messages/warnings/snapshotQuotaReached';
import { initial, invalidOnly, pending, runOnly, success } from '../ui/tasks/verify';

const TesterCreateBuildMutation = `
  mutation TesterCreateBuildMutation($input: CreateBuildInput!, $isolatorUrl: String!) {
    createBuild(input: $input, isolatorUrl: $isolatorUrl) {
      id
      number
      specCount
      snapshotCount
      componentCount
      webUrl
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
  const { version, ...commitInfo } = git; // omit version
  const autoAcceptChanges = matchesBranch(options.autoAcceptChanges, git.branch);

  const [match, componentName, name] = (only && only.match(/(.*):([^:]*)/)) || [];
  if (only) {
    if (!match) throw new Error(invalidOnly(ctx).output);
    transitionTo(runOnly)({ componentName, name }, task);
  }

  const { createBuild: build } = await client.runQuery(TesterCreateBuildMutation, {
    input: {
      ...commitInfo,
      ...(only && { only: { componentName, name } }),
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

  const isPublishOnly = !build.features.uiReview && !build.features.uiTests;
  const isOnboarding = build.number === 1 || (build.autoAcceptChanges && !autoAcceptChanges);

  transitionTo(success, true)({ ...ctx, isPublishOnly, isOnboarding }, task);

  if (list || isPublishOnly || matchesBranch(options.exitOnceUploaded, git.branch)) {
    ctx.exitCode = 0;
    ctx.skipSnapshots = true;
  }
};

export default createTask({
  title: initial.title,
  steps: [transitionTo(pending), setEnvironment, createBuild],
});
