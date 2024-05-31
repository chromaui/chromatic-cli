import gql from 'fake-tag';

import { Context } from '../types';
import { localBuildsSpecifier } from '../lib/localBuildsSpecifier';

const BaselineCommitsQuery = gql`
  query BaselineCommitsQuery(
    $branch: String!
    $parentCommits: [String!]!
    $localBuilds: LocalBuildsSpecifierInput!
  ) {
    app {
      baselineBuilds(branch: $branch, parentCommits: $parentCommits, localBuilds: $localBuilds) {
        id
        number
        status(legacy: false)
        commit
        committedAt
        uncommittedHash
        isLocalBuild
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
      uncommittedHash: string;
      isLocalBuild: boolean;
      changeCount: number;
    }[];
  };
}

export async function getBaselineBuilds(
  ctx: Pick<Context, 'options' | 'client' | 'git'>,
  { branch, parentCommits }: { branch: string; parentCommits: string[] }
) {
  const { app } = await ctx.client.runQuery<BaselineCommitsQueryResult>(BaselineCommitsQuery, {
    branch,
    parentCommits,
    localBuilds: localBuildsSpecifier(ctx),
  });
  return app.baselineBuilds;
}
