import execa from 'execa';
import setupDebug from 'debug';
import gql from 'fake-tag';
import dedent from 'ts-dedent';
import { EOL } from 'os';

const debug = setupDebug('chromatic-cli:git');

async function execGitCommand(command) {
  try {
    const { all } = await execa.command(command, {
      env: { LANG: 'C', LC_ALL: 'C' }, // make sure we're speaking English
      timeout: 10000, // 10 seconds
      all: true, // interleave stdout and stderr
    });
    return all;
  } catch (error) {
    const { message } = error;

    if (message.includes('not a git repository')) {
      throw new Error(dedent`
        Unable to execute git command '${command}'.

        Chromatic only works in git projects.
        Contact us at support@chromatic.com if you need to use Chromatic outside of one.
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

/**
 * Returns a boolean indicating whether the workspace is up-to-date (neither ahead nor behind) with
 * the remote.
 */
export async function isUpToDate() {
  execGitCommand(`git remote update`);
  const localCommit = await execGitCommand('git rev-parse HEAD');
  const remoteCommit = await execGitCommand('git rev-parse @{u}');
  if (!localCommit) {
    throw new Error('Failed to retrieve last local commit hash');
  }
  if (!remoteCommit) {
    throw new Error('Failed to retrieve last remote commit hash');
  }
  return localCommit === remoteCommit;
}

/**
 * Returns a boolean indicating whether the workspace is clean (no changes, no untracked files).
 */
export async function isClean() {
  const status = await execGitCommand('git status --porcelain');
  return status === '';
}

/**
 * Returns the "Your branch is behind by n commits (pull to update)" part of the git status message,
 * omitting any of the other stuff that may be in there. Note we expect the workspace to be clean.
 */
export async function getUpdateMessage() {
  const status = await execGitCommand('git status');
  return status
    .split(EOL + EOL)[0] // drop the 'nothing to commit' part
    .split(EOL)
    .filter(line => !line.startsWith('On branch')) // drop the 'On branch x' part
    .join(EOL)
    .trim();
}

/**
 * Returns the git merge base between two branches, which is the best common ancestor between the
 * last commit on either branch. The "best" is defined by not having any descendants which are a
 * common ancestor themselves. Consider this example:
 *
 *   - A - M  <= master
 *      \ /
 *       B    <= develop
 *        \
 *         C  <= feature
 *
 * The merge base between master and feature is B, because it's the best common ancestor of C and M.
 * A is a common ancestor too, but it isn't the "best" one because it's an ancestor of B.
 *
 * It's also possible to have a situation with two merge bases, where there isn't one "best" option:
 *
 *   - A - M  <= master
 *      \ /
 *       x    (not a commit)
 *      / \
 *   - B - N  <= develop
 *
 * Here, both A and B are the best common ancestor between master and develop. Neither one is the
 * single "best" option because they aren't ancestors of each other. In this case we try to pick the
 * one on the base branch, but if that fails we just pick the first one and hope it works out.
 * Luckily this is an uncommon scenario.
 *
 * @param {string} headRef Name of the head branch
 * @param {string} baseRef Name of the base branch
 */
export async function findMergeBase(headRef, baseRef) {
  const result = await execGitCommand(`git merge-base --all ${headRef} ${baseRef}`);
  const mergeBases = result.split(EOL).filter(Boolean);
  if (mergeBases.length === 0) return undefined;
  if (mergeBases.length === 1) return mergeBases[0];

  // If we find multiple merge bases, look for one on the base branch.
  // If we don't find a merge base on the base branch, just return the first one.
  const branchNames = await Promise.all(
    mergeBases.map(async sha => {
      const name = await execGitCommand(`git name-rev --name-only --exclude="tags/*" ${sha}`);
      return name.replace(/~[0-9]+$/, ''); // Drop the potential suffix
    })
  );
  const baseRefIndex = branchNames.findIndex(branch => branch === baseRef);
  return mergeBases[baseRefIndex] || mergeBases[0];
}

export async function checkout(ref) {
  return execGitCommand(`git checkout ${ref}`);
}

export async function checkoutPrevious() {
  return execGitCommand(`git checkout -`);
}

export async function discardChanges() {
  return execGitCommand(`git reset --hard`);
}
