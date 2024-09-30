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

/**
 * Get branch name from a pull request number via the Index service.
 *
 * @param ctx The context set when executing the CLI.
 * @param options Options to pass to the Index query.
 * @param options.number The pull request number.
 *
 * @returns The branch name, if available.
 */
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
