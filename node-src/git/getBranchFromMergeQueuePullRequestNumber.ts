import gql from 'fake-tag';

import { Context } from '../types';

const MergeQueueOriginalBranchQuery = gql`
  query MergeQueueOriginalBranchQuery($number: Int!) {
    app {
      pullRequest(number: $number) {
        branch: headRefName
      }
    }
  }
`;
interface MergeQueueOriginalBranchQueryResult {
  app: {
    pullRequest: {
      branch: string;
    };
  };
}

export async function getBranchFromMergeQueuePullRequestNumber(
  ctx: Pick<Context, 'options' | 'client' | 'git'>,
  { number }: { number: number }
) {
  const { app } = await ctx.client.runQuery<MergeQueueOriginalBranchQueryResult>(
    MergeQueueOriginalBranchQuery,
    {
      number,
    }
  );

  return app?.pullRequest?.branch;
}
