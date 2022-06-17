import gql from 'fake-tag';

import { Context } from '../types';

const BaselineCommitsQuery = gql`
  query BaselineCommitsQuery($branch: String!, $parentCommits: [String!]!) {
    app {
      baselineBuilds(branch: $branch, parentCommits: $parentCommits) {
        id
        number
        status(legacy: false)
        commit
        committedAt
        changeCount
      }
    }
  }
`;
interface BaselineCommitsQueryResult {
  app: {
    baselineBuilds: {
      id: string;
      number: number;
      status: string;
      commit: string;
      committedAt: number;
      changeCount: number;
    }[];
  };
}

export async function getBaselineBuilds(
  { client }: Pick<Context, 'client'>,
  { branch, parentCommits }: { branch: string; parentCommits: string[] }
) {
  const { app } = await client.runQuery<BaselineCommitsQueryResult>(BaselineCommitsQuery, {
    branch,
    parentCommits,
  });
  return app.baselineBuilds;
}
