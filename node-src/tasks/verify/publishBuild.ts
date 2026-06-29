import { exitCodes, TaskFailure } from '../../lib/setExitCode';
import { Context, Deps, TurboSnapStatus } from '../../types';
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

export interface PublishBuildInput {
  announcedBuild: Context['announcedBuild'];
  options: Context['options'];
  replacementBuildIds?: Context['git']['replacementBuildIds'];
  onlyStoryFiles?: string[];
  turboSnap?: Context['turboSnap'];
}

export interface PublishBuildResult {
  announcedBuild: Context['announcedBuild'];
  storybookUrl: string;
}

export const publishBuild = async (
  deps: Deps,
  input: PublishBuildInput
): Promise<PublishBuildResult> => {
  const { client } = deps;
  const { announcedBuild, replacementBuildIds, turboSnap } = input;
  const { id, reportToken } = announcedBuild;
  const { onlyStoryNames, onlyStoryFiles = input.onlyStoryFiles } = input.options;

  let turboSnapBailReason;
  let turboSnapStatus: TurboSnapStatus = 'UNUSED';
  if (turboSnap) {
    turboSnapBailReason = turboSnap.bailReason;
    turboSnapStatus = turboSnap.bailReason ? 'BAILED' : 'APPLIED';
  }

  const { publishBuild: publishedBuild } = await client.runQuery<PublishBuildMutationResult>(
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

  // Queueing the extract may have failed
  if (publishedBuild.status === 'FAILED') {
    throw new TaskFailure(publishFailed(input).output, { exitCode: exitCodes.BUILD_FAILED });
  }

  return {
    announcedBuild: { ...announcedBuild, ...publishedBuild },
    storybookUrl: publishedBuild.storybookUrl,
  };
};
