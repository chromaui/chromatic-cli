import gql from 'fake-tag';

import { localBuildsSpecifier } from '../lib/localBuildsSpecifier';
import { Context } from '../types';
import { commitExists, execGitCommand } from './git';

export const FETCH_N_INITIAL_BUILD_COMMITS = 20;

const FirstCommittedAtQuery = gql`
  query FirstCommittedAtQuery($branch: String!, $localBuilds: LocalBuildsSpecifierInput!) {
    app {
      firstBuild(sortByCommittedAt: true, localBuilds: $localBuilds) {
        committedAt
      }
      lastBuild(branch: $branch, sortByCommittedAt: true, localBuilds: $localBuilds) {
        commit
        committedAt
      }
    }
  }
`;
interface FirstCommittedAtQueryResult {
  app: {
    firstBuild: {
      committedAt: number;
    };
    lastBuild: {
      commit: string;
      committedAt: number;
    };
  };
}

const HasBuildsWithCommitsQuery = gql`
  query HasBuildsWithCommitsQuery($commits: [String!]!, $localBuilds: LocalBuildsSpecifierInput!) {
    app {
      hasBuildsWithCommits(commits: $commits, localBuilds: $localBuilds)
    }
  }
`;
interface HasBuildsWithCommitsQueryResult {
  app: {
    hasBuildsWithCommits: string[];
  };
}

const MergeCommitsQuery = gql`
  query MergeCommitsQuery($mergeInfoList: [MergedInfoInput]!) {
    app {
      mergedPullRequests(mergeInfoList: $mergeInfoList) {
        lastHeadBuild {
          commit
        }
      }
    }
  }
`;
interface MergeCommitsQueryResult {
  app: {
    mergedPullRequests: [
      {
        lastHeadBuild: {
          commit: string;
        };
      },
    ];
  };
}

function commitsForCLI(commits: string[]) {
  return commits.map((c) => c.trim()).join(' ');
}

// git rev-list in a basic form gives us a list of commits reaching back to
// `firstCommittedAtSeconds` (i.e. when the first build of this app happened)
// in reverse chronological order.
//
// A simplified version of what we are doing here is just finding the first
// commit in that list that has a build. We only want to send `limit` to
// the server in this pass (although we may already know some commits that do
// or do not have builds from earlier passes). So we just pick the first `limit`
// commits from the command, filtering out `commitsWith[out]Builds`.
//
// However, it's not quite that simple -- because of branching. However,
// passing commits after `--not` in to `git rev-list` *occludes* all the ancestors
// of those commits. This is exactly what we need once we find one or more commits
// that do have builds: a list of the ancestors of HEAD that are not accestors of
// `commitsWithBuilds`.
//
async function nextCommits(
  { log }: Pick<Context, 'log'>,
  limit: number,
  {
    firstCommittedAtSeconds,
    commitsWithBuilds,
    commitsWithoutBuilds,
  }: {
    firstCommittedAtSeconds: number;
    commitsWithBuilds: string[];
    commitsWithoutBuilds: string[];
  }
) {
  // We want the next limit commits that aren't "covered" by `commitsWithBuilds`
  // This will print out all commits in `commitsWithoutBuilds` (except if they are covered),
  // so we ask enough that we'll definitely get `limit` unknown commits
  const command = `git rev-list HEAD \
      ${firstCommittedAtSeconds ? `--since ${firstCommittedAtSeconds}` : ''} \
      -n ${limit + commitsWithoutBuilds.length} --not ${commitsForCLI(commitsWithBuilds)}`;
  log.debug(`running ${command}`);
  const commitsString = await execGitCommand(command);
  const commits = commitsString.split('\n').filter(Boolean);
  log.debug(`command output: ${commits}`);

  // Later on we want to know which commits we visited on the way to finding the ancestor commits
  // The output of the above rev-list commit includes possibly commits with builds so filter them.
  // NOTE: this list can include irrelevant commits during earlier iterations of step() when we
  // don't yet have an accurate list of commitsWithBuilds, however we only use it in the final step.
  const visitedCommitsWithoutBuilds = commits.filter((c) => !commitsWithBuilds.includes(c));

  // No sense in checking commits we already know about
  const candidateCommits = visitedCommitsWithoutBuilds
    .filter((c) => !commitsWithoutBuilds.includes(c))
    .slice(0, limit);

  return { visitedCommitsWithoutBuilds, candidateCommits };
}

// Exponentially iterate `limit` up to infinity to find a "covering" set of commits with builds
async function step(
  { options, client, log, git }: Pick<Context, 'options' | 'client' | 'log' | 'git'>,
  limit: number,
  {
    firstCommittedAtSeconds,
    commitsWithBuilds,
    commitsWithoutBuilds,
  }: {
    firstCommittedAtSeconds: number;
    commitsWithBuilds: string[];
    commitsWithoutBuilds: string[];
  }
) {
  log.debug(`step: checking ${limit} up to ${firstCommittedAtSeconds}`);
  log.debug(`step: commitsWithBuilds: ${commitsWithBuilds}`);
  log.debug(`step: commitsWithoutBuilds: ${commitsWithoutBuilds}`);

  const { candidateCommits, visitedCommitsWithoutBuilds } = await nextCommits({ log }, limit, {
    firstCommittedAtSeconds,
    commitsWithBuilds,
    commitsWithoutBuilds,
  });

  log.debug(
    `step: candidateCommits: ${candidateCommits}, visitedCommitsWithoutBuilds: ${visitedCommitsWithoutBuilds}`
  );

  // No more commits uncovered commitsWithBuilds!
  if (candidateCommits.length === 0) {
    log.debug('step: no candidateCommits; we are done');
    return { commitsWithBuilds, visitedCommitsWithoutBuilds };
  }

  const {
    app: { hasBuildsWithCommits: newCommitsWithBuilds },
  } = await client.runQuery<HasBuildsWithCommitsQueryResult>(HasBuildsWithCommitsQuery, {
    commits: candidateCommits,
    localBuilds: localBuildsSpecifier({ options, git }),
  });
  log.debug(`step: newCommitsWithBuilds: ${newCommitsWithBuilds}`);

  const newCommitsWithoutBuilds = candidateCommits.filter(
    (commit) => !newCommitsWithBuilds.includes(commit)
  );

  return step({ options, client, log, git }, limit * 2, {
    firstCommittedAtSeconds,
    commitsWithBuilds: [...commitsWithBuilds, ...newCommitsWithBuilds],
    commitsWithoutBuilds: [...commitsWithoutBuilds, ...newCommitsWithoutBuilds],
  });
}

// Which of the listed commits are "maximally descendent":
// ie c in commits such that there are no descendents of c in commits.
async function maximallyDescendentCommits({ log }: Pick<Context, 'log'>, commits: string[]) {
  if (commits.length === 0) {
    return commits;
  }

  // <commit>^@ expands to all parents of commit
  const parentCommits = commits.map((c) => `"${c}^@"`);
  // List the tree from <commits> not including the tree from <parentCommits>
  // This just filters any commits that are ancestors of other commits
  const command = `git rev-list ${commitsForCLI(commits)} --not ${commitsForCLI(parentCommits)}`;
  log.debug(`running ${command}`);
  const maxCommitsString = await execGitCommand(command);
  const maxCommits = maxCommitsString.split('\n').filter(Boolean);
  log.debug(`command output: ${maxCommits}`);

  return maxCommits;
}

/**
 * Gather the parent commits from Git.
 *
 * @param ctx The context set when executing the CLI.
 * @param options Additional options for changing function flow.
 * @param options.ignoreLastBuildOnBranch Ignore the last Chromatic build associated with this
 * branch.
 *
 * @returns A list of parent commits associated with this branch.
 */
// TODO: refactor this function
// eslint-disable-next-line complexity, max-statements
export async function getParentCommits(ctx: Context, { ignoreLastBuildOnBranch = false } = {}) {
  const { options, client, git, log } = ctx;
  const { branch, committedAt } = git;

  // Include the latest build from this branch as an ancestor of the current build
  const { app } = await client.runQuery<FirstCommittedAtQueryResult>(
    FirstCommittedAtQuery,
    { branch, localBuilds: localBuildsSpecifier({ options, git }) },
    { retries: 5 } // This query requires a request to an upstream provider which may fail
  );
  const { firstBuild, lastBuild } = app;
  log.debug(`App firstBuild: %o, lastBuild: %o`, firstBuild, lastBuild);

  if (!firstBuild) {
    log.debug('App has no builds, returning []');
    return [];
  }

  const initialCommitsWithBuilds: string[] = [];
  const extraParentCommits: string[] = [];

  // Add the most recent build on the branch as a parent build, unless:
  //   - the user opts out with `--ignore-last-build-on-branch`
  //   - the commit is newer than the build we are running, in which case we doing this build out
  //     of order and that could lead to problems.
  //   - the current branch is `HEAD`; this is fairly meaningless
  //     (CI systems that have been pushed tags can not set a branch)
  // @see https://www.chromatic.com/docs/branching-and-baselines#rebasing
  if (
    branch !== 'HEAD' &&
    !ignoreLastBuildOnBranch &&
    lastBuild &&
    lastBuild.committedAt <= committedAt
  ) {
    if (await commitExists(lastBuild.commit)) {
      log.debug(`Adding last branch build commit ${lastBuild.commit} to commits with builds`);
      initialCommitsWithBuilds.push(lastBuild.commit);
    } else {
      log.debug(
        `Last branch build commit ${lastBuild.commit} not in index, blindly appending to parents`
      );
      extraParentCommits.push(lastBuild.commit);
    }
  }

  // Get a "covering" set of commits that have builds. This is a set of commits
  // such that any ancestor of HEAD is either:
  //   - in commitsWithBuilds
  //   - an ancestor of a commit in commitsWithBuilds
  //   - has no build
  const { commitsWithBuilds, visitedCommitsWithoutBuilds } = await step(
    { options, client, log, git },
    FETCH_N_INITIAL_BUILD_COMMITS,
    {
      firstCommittedAtSeconds: firstBuild.committedAt && firstBuild.committedAt / 1000,
      commitsWithBuilds: initialCommitsWithBuilds,
      commitsWithoutBuilds: [],
    }
  );

  const mergeInfoList = visitedCommitsWithoutBuilds.map((commit) => {
    return { commit, baseRefName: branch };
  });
  const {
    app: { mergedPullRequests },
  } = await client.runQuery<MergeCommitsQueryResult>(
    MergeCommitsQuery,
    { mergeInfoList: mergeInfoList.slice(0, 100) }, // Limit amount sent in API call
    { retries: 5 } // This query requires a request to an upstream provider which may fail
  );

  for (const pullRequest of mergedPullRequests) {
    // Add the most recent build on a (merged) branch as an ancestor if we visit a commit
    // during our ancestor selection that was the merge commit for that PR.
    // @see https://www.chromatic.com/docs/branching-and-baselines#squash-and-rebase-merging
    const lastHeadBuildCommit = pullRequest.lastHeadBuild?.commit;
    if (lastHeadBuildCommit) {
      if (await commitExists(lastHeadBuildCommit)) {
        log.debug(`Adding merged PR build commit ${lastHeadBuildCommit} to commits with builds`);
        commitsWithBuilds.push(lastHeadBuildCommit);
      } else {
        log.debug(
          `Merged PR build commit ${lastHeadBuildCommit} not in index, blindly appending to parents`
        );
        extraParentCommits.push(lastHeadBuildCommit);
      }
    }
  }

  log.debug(`Final commitsWithBuilds: ${commitsWithBuilds}`);

  // For any pair A,B of builds, there is no point in using B if it is an ancestor of A.
  const descendentCommits = await maximallyDescendentCommits({ log }, commitsWithBuilds);

  const ancestorCommits = [...extraParentCommits, ...descendentCommits];
  return ancestorCommits;
}
