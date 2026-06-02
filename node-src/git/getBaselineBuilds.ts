import gql from 'fake-tag';

import { localBuildsSpecifier } from '../lib/localBuildsSpecifier';
import { BaselineBuild, Deps, Git } from '../types';

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
    baselineBuilds: BaselineBuild[];
  };
}

/**
 * Get a list of baseline builds from the Index service
 *
 * @param deps Dependencies (options, client).
 * @param options Options to pass to the Index query.
 * @param options.branch The branch name.
 * @param options.parentCommits A list of parent commit hashes.
 * @param options.git Git information for the current build.
 *
 * @returns A list of baseline builds, if available.
 */
export async function getBaselineBuilds(
  deps: Pick<Deps, 'options' | 'client'>,
  { branch, parentCommits, git }: { branch: string; parentCommits: string[]; git: Git }
) {
  const { app } = await deps.client.runQuery<BaselineCommitsQueryResult>(BaselineCommitsQuery, {
    branch,
    parentCommits,
    localBuilds: localBuildsSpecifier(deps, git),
  });
  return app.baselineBuilds;
}
