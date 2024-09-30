import gql from 'fake-tag';

import { localBuildsSpecifier } from '../lib/localBuildsSpecifier';
import { Context } from '../types';

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

/**
 * Get a list of baseline builds from the Index service
 *
 * @param ctx The context set when executing the CLI.
 * @param options Options to pass to the Index query.
 * @param options.branch The branch name.
 * @param options.parentCommits A list of parent commit hashes.
 *
 * @returns A list of baseline builds, if available.
 */
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
