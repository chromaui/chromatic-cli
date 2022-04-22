import { exitCodes, setExitCode } from '../lib/setExitCode';
import { createTask, transitionTo } from '../lib/tasks';
import listingStories from '../ui/messages/info/listingStories';
import storybookPublished from '../ui/messages/info/storybookPublished';
import buildLimited from '../ui/messages/warnings/buildLimited';
import paymentRequired from '../ui/messages/warnings/paymentRequired';
import snapshotQuotaReached from '../ui/messages/warnings/snapshotQuotaReached';
import {
  initial,
  dryRun,
  pending,
  runOnly,
  runOnlyFiles,
  success,
  publishFailed,
} from '../ui/tasks/verify';
import turboSnapEnabled from '../ui/messages/info/turboSnapEnabled';
import { Context, Task } from '../types';
import { waitForBuild } from '../lib/waitForBuild';

const PublishBuildMutation = `
  mutation PublishBuildMutation($id: ID!, $input: PublishBuildInput!) {
    publishBuild(id: $id, input: $input) {
      status
    }
  }
`;

interface PublishBuildMutationResult {
  publishBuild: Context['announcedBuild'];
}

export const publishBuild = async (ctx: Context) => {
  const { cachedUrl, isolatorUrl, onlyStoryFiles, turboSnap } = ctx;
  const { only } = ctx.options;

  const { publishBuild: publishedBuild } = await ctx.client.runQuery<PublishBuildMutationResult>(
    PublishBuildMutation,
    {
      id: ctx.announcedBuild.id,
      input: {
        cachedUrl,
        isolatorUrl,
        ...(only && { onlyStoryNames: [].concat(only) }),
        ...(onlyStoryFiles && { onlyStoryFiles: Object.keys(onlyStoryFiles) }),
        // GraphQL does not support union input types (yet), so we stringify the bailReason
        // @see https://github.com/graphql/graphql-spec/issues/488
        ...(turboSnap &&
          turboSnap.bailReason && { turboSnapBailReason: JSON.stringify(turboSnap.bailReason) }),
      },
    },
    { retries: 3 }
  );

  ctx.announcedBuild = { ...ctx.announcedBuild, ...publishedBuild };

  // Queueing the extract may have failed
  if (publishedBuild.status === 'FAILED') {
    setExitCode(ctx, exitCodes.BUILD_FAILED, false);
    throw new Error(publishFailed().output);
  }
};

export const verifyBuild = async (ctx: Context, task: Task) => {
  const { onlyStoryFiles } = ctx;
  const { list, only } = ctx.options;
  const { matchesBranch } = ctx.git;

  // It's not possible to set both --only and --only-changed
  if (only) {
    transitionTo(runOnly)(ctx, task);
  }
  if (onlyStoryFiles) {
    transitionTo(runOnlyFiles)(ctx, task);
  }

  ctx.build = await waitForBuild(ctx, 'Verify', ({ status }) => status === 'IN_PROGRESS');
  ctx.isPublishOnly = !ctx.build.features.uiReview && !ctx.build.features.uiTests;

  if (list) {
    ctx.log.info(listingStories(ctx.build.tests));
  }

  if (ctx.turboSnap && !ctx.turboSnap.bailReason) {
    ctx.log.info(turboSnapEnabled(ctx));
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
  steps: [transitionTo(pending), publishBuild, verifyBuild],
});
