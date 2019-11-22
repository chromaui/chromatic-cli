import { execSync } from 'child_process';
import setupDebug from 'debug';
import gql from 'fake-tag';
import dedent from 'ts-dedent';

import log from '../lib/log';

const debug = setupDebug('chromatic-cli:git');

async function execGitCommand(command) {
  try {
    return execSync(`${command} 2>&1`)
      .toString()
      .trim();
  } catch (error) {
    const { output } = error;

    const message = output.toString();

    if (message.includes('Not a git repository')) {
      throw new Error(dedent`
        Unable to execute git command '${command}'.

        Chromatic only works in git projects.
        Contact us at support@hichroma.com if you need to use Chromatic outside of one.
      `);
    }

    if (message.includes('git not found')) {
      throw new Error(dedent`
        Unable to execute git command '${command}'.

        Chromatic only works in with git installed.
      `);
    }

    if (message.includes('does not have any commits yet')) {
      throw new Error(dedent`
        Unable to execute git command '${command}'.

        Chromatic requires that you have created a commit before it can be run.
      `);
    }

    throw error;
  }
}

export const FETCH_N_INITIAL_BUILD_COMMITS = 20;

const TesterFirstCommittedAtQuery = gql`
  query TesterFirstCommittedAtQuery($branch: String!) {
    app {
      firstBuild(sortByCommittedAt: true) {
        committedAt
      }
      lastBuild(branch: $branch, sortByCommittedAt: true) {
        commit
        committedAt
      }
    }
  }
`;

const TesterHasBuildsWithCommitsQuery = gql`
  query TesterHasBuildsWithCommitsQuery($commits: [String!]!) {
    app {
      hasBuildsWithCommits(commits: $commits)
    }
  }
`;

// NOTE: At some point we should check that the commit has been pushed to the
// remote and the branch matches with origin/REF, but for now we are naive about
// adhoc builds.

// We could cache this, but it's probably pretty quick
export async function getCommit() {
  const [commit, committedAtSeconds, committerEmail, committerName] = (
    await execGitCommand(`git log -n 1 --format="%H,%ct,%ce,%cn"`)
  ).split(',');

  return { commit, committedAt: committedAtSeconds * 1000, committerEmail, committerName };
}

export async function getBranch() {
  return execGitCommand(`git rev-parse --abbrev-ref HEAD`);
}

// Check if a commit exists in the repository
async function commitExists(commit) {
  try {
    await execGitCommand(`git cat-file -e "${commit}^{commit}"`);
    return true;
  } catch (error) {
    return false;
  }
}

function commitsForCLI(commits) {
  return commits.map(c => c.trim()).join(' ');
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
  limit,
  { firstCommittedAtSeconds, commitsWithBuilds, commitsWithoutBuilds }
) {
  // We want the next limit commits that aren't "covered" by `commitsWithBuilds`
  // This will print out all commits in `commitsWithoutBuilds` (except if they are covered),
  // so we ask enough that we'll definitely get `limit` unknown commits
  const command = `git rev-list HEAD \
      ${firstCommittedAtSeconds ? `--since ${firstCommittedAtSeconds}` : ''} \
      -n ${limit + commitsWithoutBuilds.length} --not ${commitsForCLI(commitsWithBuilds)}`;
  debug(`running ${command}`);
  const commits = (await execGitCommand(command)).split('\n').filter(c => !!c);
  debug(`command output: ${commits}`);

  return (
    commits
      // No sense in checking commits we already know about
      .filter(c => !commitsWithBuilds.includes(c))
      .filter(c => !commitsWithoutBuilds.includes(c))
      .slice(0, limit)
  );
}

// Which of the listed commits are "maximally descendent":
// ie c in commits such that there are no descendents of c in commits.
async function maximallyDescendentCommits(commits) {
  if (commits.length === 0) {
    return commits;
  }

  // <commit>^@ expands to all parents of commit
  const parentCommits = commits.map(c => `"${c}^@"`);
  // List the tree from <commits> not including the tree from <parentCommits>
  // This just filters any commits that are ancestors of other commits
  const command = `git rev-list ${commitsForCLI(commits)} --not ${commitsForCLI(parentCommits)}`;
  debug(`running ${command}`);
  const maxCommits = (await execGitCommand(command)).split('\n').filter(c => !!c);
  debug(`command output: ${maxCommits}`);

  return maxCommits;
}

// Exponentially iterate `limit` up to infinity to find a "covering" set of commits with builds
async function step(
  client,
  limit,
  { firstCommittedAtSeconds, commitsWithBuilds, commitsWithoutBuilds }
) {
  debug(`step: checking ${limit} up to ${firstCommittedAtSeconds}`);
  debug(`step: commitsWithBuilds: ${commitsWithBuilds}`);
  debug(`step: commitsWithoutBuilds: ${commitsWithoutBuilds}`);

  const candidateCommits = await nextCommits(limit, {
    firstCommittedAtSeconds,
    commitsWithBuilds,
    commitsWithoutBuilds,
  });

  debug(`step: candidateCommits: ${candidateCommits}`);

  // No more commits uncovered commitsWithBuilds!
  if (candidateCommits.length === 0) {
    debug('step: no candidateCommits; we are done');
    return commitsWithBuilds;
  }

  const {
    app: { hasBuildsWithCommits: newCommitsWithBuilds },
  } = await client.runQuery(TesterHasBuildsWithCommitsQuery, {
    commits: candidateCommits,
  });
  debug(`step: newCommitsWithBuilds: ${newCommitsWithBuilds}`);

  const newCommitsWithoutBuilds = candidateCommits.filter(
    commit => !newCommitsWithBuilds.find(c => c === commit)
  );

  return step(client, limit * 2, {
    firstCommittedAtSeconds,
    commitsWithBuilds: [...commitsWithBuilds, ...newCommitsWithBuilds],
    commitsWithoutBuilds: [...commitsWithoutBuilds, ...newCommitsWithoutBuilds],
  });
}

export async function getBaselineCommits(client, { branch, ignoreLastBuildOnBranch = false } = {}) {
  const { committedAt } = await getCommit();

  // Include the latest build from this branch as an ancestor of the current build
  const {
    app: { firstBuild, lastBuild },
  } = await client.runQuery(TesterFirstCommittedAtQuery, {
    branch,
  });
  debug(`App firstBuild: ${firstBuild}, lastBuild: ${lastBuild}`);

  if (!firstBuild) {
    debug('App has no builds, returning []');
    return [];
  }

  const initialCommitsWithBuilds = [];
  const extraBaselineCommits = [];

  // Don't do any special branching logic for builds on `HEAD`, this is fairly meaningless
  // (CI systems that have been pushed tags can not set a branch)
  if (
    branch !== 'HEAD' &&
    !ignoreLastBuildOnBranch &&
    lastBuild &&
    lastBuild.committedAt <= committedAt
  ) {
    if (await commitExists(lastBuild.commit)) {
      initialCommitsWithBuilds.push(lastBuild.commit);
    } else {
      debug(`Last build commit not in index, blindly appending to baselines`);
      extraBaselineCommits.push(lastBuild.commit);
    }
  }

  // Get a "covering" set of commits that have builds. This is a set of commits
  // such that any ancestor of HEAD is either:
  //   - in commitsWithBuilds
  //   - an ancestor of a commit in commitsWithBuilds
  //   - has no build
  const commitsWithBuilds = await step(client, FETCH_N_INITIAL_BUILD_COMMITS, {
    firstCommittedAtSeconds: firstBuild.committedAt && firstBuild.committedAt / 1000,
    commitsWithBuilds: initialCommitsWithBuilds,
    commitsWithoutBuilds: [],
  });

  debug(`Final commitsWithBuilds: ${commitsWithBuilds}`);

  // For any pair A,B of builds, there is no point in using B if it is an ancestor of A.
  return [...extraBaselineCommits, ...(await maximallyDescendentCommits(commitsWithBuilds))];
}
