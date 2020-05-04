import { TesterCreateBuildMutation } from '../io/gql-queries';
import { createTask, setTitle, setOutput } from '../lib/tasks';
import { matchesBranch } from '../lib/utils';
import { getStories } from '../storybook/getStories';
import buildLimited from '../ui/warnings/buildLimited';
import paymentRequired from '../ui/warnings/paymentRequired';
import snapshotQuotaReached from '../ui/warnings/snapshotQuotaReached';
import { ENVIRONMENT_WHITELIST } from '../constants';

const getEnvironment = async ctx => {
  // We send up all environment variables provided by these complicated systems.
  // We don't want to send up *all* environment vars as they could include sensitive information
  // about the user's build environment
  ctx.environment = JSON.stringify(
    Object.entries(process.env).reduce((acc, [key, value]) => {
      if (ENVIRONMENT_WHITELIST.find(regex => key.match(regex))) {
        acc[key] = value;
      }
      return acc;
    }, {})
  );
  ctx.log.debug(`Got environment ${ctx.environment}`);
};

const createBuild = async (ctx, task) => {
  const { client, environment, git, log, pkg, cachedUrl, isolatorUrl, options } = ctx;
  const { patchBaseRef, patchHeadRef, preserveMissingSpecs } = options;
  const { version, ...commitInfo } = git; // omit version
  const autoAcceptChanges = matchesBranch(options.autoAcceptChanges, git.branch);

  const { createBuild: build } = await client.runQuery(TesterCreateBuildMutation, {
    input: {
      ...commitInfo,
      autoAcceptChanges,
      cachedUrl,
      environment,
      patchBaseRef,
      patchHeadRef,
      preserveMissingSpecs,
      runtimeSpecs: await getStories(log, { ...options, isolatorUrl }),
      packageVersion: pkg.version,
      storybookVersion: ctx.storybook.version,
      viewLayer: ctx.storybook.viewLayer,
      addons: ctx.storybook.addons,
    },
    isolatorUrl,
  });

  ctx.build = build;

  const { account } = build.app;
  if (build.wasLimited) {
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

  setTitle(
    isPublishOnly ? `Published your Storybook` : `Started build ${build.number}`,
    isOnboarding
      ? `Continue setup at ${build.app.setupUrl}`
      : `View build details at ${build.webUrl}`
  )(ctx, task);

  if (isPublishOnly || matchesBranch(options.exitOnceUploaded, git.branch)) {
    ctx.exitCode = 0;
    ctx.skipSnapshots = true;
  }
};

export default createTask({
  title: 'Verify the uploaded Storybook',
  steps: [
    setTitle('Verifying upload'),
    setOutput('This may take a few minutes'),
    getEnvironment,
    createBuild,
  ],
});
