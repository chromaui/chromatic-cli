import { exitCodes, setExitCode } from '../../lib/setExitCode';
import { Context, TurboSnapStatus } from '../../types';
import { publishFailed } from '../../ui/tasks/verify';

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
  let turboSnapStatus: TurboSnapStatus = 'UNUSED';
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
        ...(onlyStoryNames && { onlyStoryNames: [onlyStoryNames].flat() }),
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
    throw new Error(publishFailed(ctx).output);
  }
};
