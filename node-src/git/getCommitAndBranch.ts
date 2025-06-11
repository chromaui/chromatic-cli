import envCi from 'env-ci';

import { Context } from '../types';
import forksUnsupported from '../ui/messages/errors/forksUnsupported';
import gitOneCommit from '../ui/messages/errors/gitOneCommit';
import missingGitHubInfo from '../ui/messages/errors/missingGitHubInfo';
import missingTravisInfo from '../ui/messages/errors/missingTravisInfo';
import customGitHubAction from '../ui/messages/info/customGitHubAction';
import noCommitDetails from '../ui/messages/warnings/noCommitDetails';
import travisInternalBuild from '../ui/messages/warnings/travisInternalBuild';
import { getBranchFromMergeQueuePullRequestNumber } from './getBranchFromMergeQueuePullRequestNumber';
import { getBranch, getCommit, hasPreviousCommit, mergeQueueBranchMatch } from './git';

const ORIGIN_PREFIX_REGEXP = /^origin\//;
const notHead = (branch) => (branch && branch !== 'HEAD' ? branch : false);

interface CommitInfo {
  commit: string;
  committedAt: number;
  committerEmail?: string;
  committerName?: string;
  mergeCommit?: string;
}

/**
 *  Gather commit and branch information from Git and the local environment.
 *
 * @param ctx The context set when executing the CLI.
 * @param options Some extra details about the repository.
 * @param options.branchName The name of the branch.
 * @param options.patchBaseRef The reference to the base side of a patch.
 * @param options.ci If we're running in a CI pipeline or not.
 *
 * @returns Commit and branch information.
 */
// TODO: refactor this function
// eslint-disable-next-line complexity, max-statements
export default async function getCommitAndBranch(
  ctx: Context,
  {
    branchName,
    patchBaseRef,
    ci,
  }: { branchName?: string; patchBaseRef?: string; ci?: boolean } = {}
) {
  const { log } = ctx;
  let commit: CommitInfo = await getCommit(ctx);
  let branch = notHead(branchName) || notHead(patchBaseRef) || (await getBranch(ctx));
  let slug;

  const {
    TRAVIS_COMMIT,
    TRAVIS_EVENT_TYPE,
    TRAVIS_PULL_REQUEST_SLUG,
    TRAVIS_REPO_SLUG,
    TRAVIS_PULL_REQUEST_SHA,
    TRAVIS_PULL_REQUEST_BRANCH,
    GITHUB_ACTIONS,
    GITHUB_EVENT_NAME,
    GITHUB_REPOSITORY,
    GITHUB_BASE_REF,
    GITHUB_HEAD_REF,
    GITHUB_SHA,
    CHROMATIC_SHA,
    CHROMATIC_BRANCH,
    CHROMATIC_PULL_REQUEST_SHA,
    CHROMATIC_SLUG,
  } = process.env;

  const {
    isCi,
    service,
    prBranch,
    branch: ciBranch,
    commit: ciCommit,
    slug: ciSlug,
  } = (() => {
    try {
      return envCi();
    } catch (err) {
      log.debug('Failure while parsing CI environment variables', err);
      throw err;
    }
  })();

  const isFromEnvironmentVariable = CHROMATIC_SHA && CHROMATIC_BRANCH; // Our GitHub Action also sets these
  const isTravisPrBuild = TRAVIS_EVENT_TYPE === 'pull_request';
  const isGitHubAction = GITHUB_ACTIONS === 'true';
  const isGitHubPrBuild = GITHUB_EVENT_NAME === 'pull_request';

  if (!(await hasPreviousCommit(ctx))) {
    const message = gitOneCommit(isGitHubAction);
    if (isCi) {
      throw new Error(message);
    } else {
      log.warn(message);
    }
  }

  if (isFromEnvironmentVariable) {
    commit = await getCommit(ctx, CHROMATIC_SHA).catch((err) => {
      log.warn(noCommitDetails({ sha: CHROMATIC_SHA, env: 'CHROMATIC_SHA' }));
      log.debug(err);
      return { commit: CHROMATIC_SHA, committedAt: Date.now() };
    });
    if (CHROMATIC_PULL_REQUEST_SHA) {
      commit.mergeCommit = CHROMATIC_PULL_REQUEST_SHA;
    }
    branch = CHROMATIC_BRANCH;
    slug = CHROMATIC_SLUG;
  } else if (isTravisPrBuild) {
    if (TRAVIS_PULL_REQUEST_SLUG === TRAVIS_REPO_SLUG) {
      log.warn(travisInternalBuild());
    }
    if (!TRAVIS_PULL_REQUEST_SHA || !TRAVIS_PULL_REQUEST_BRANCH) {
      throw new Error(missingTravisInfo({ TRAVIS_EVENT_TYPE }));
    }

    // Travis PR builds are weird, we want to ensure we mark build against the commit that was
    // merged from, rather than the resulting "ephemeral" merge commit that doesn't stick around in the
    // history of the project (so approvals will get lost). We also have to ensure we use the right branch.
    commit = await getCommit(ctx, TRAVIS_PULL_REQUEST_SHA).catch((err) => {
      log.warn(noCommitDetails({ sha: TRAVIS_PULL_REQUEST_SHA, env: 'TRAVIS_PULL_REQUEST_SHA' }));
      log.debug(err);
      return { commit: TRAVIS_PULL_REQUEST_SHA, committedAt: Date.now() };
    });
    if (TRAVIS_COMMIT) {
      commit.mergeCommit = TRAVIS_COMMIT;
    }
    branch = TRAVIS_PULL_REQUEST_BRANCH;
    slug = TRAVIS_PULL_REQUEST_SLUG;
  } else if (isGitHubPrBuild) {
    log.info(customGitHubAction());

    if (!GITHUB_HEAD_REF || !GITHUB_SHA) {
      throw new Error(missingGitHubInfo({ GITHUB_EVENT_NAME }));
    }
    if (GITHUB_BASE_REF === GITHUB_HEAD_REF) {
      throw new Error(forksUnsupported());
    }

    // GitHub PR builds run against a "virtual merge commit" with a SHA unknown to Chromatic and an
    // invalid branch name, so we override these using environment variables available in the action.
    // This does not apply to our GitHub Action, because it'll set CHROMATIC_SHA, -BRANCH and -SLUG.
    // We intentionally use the GITHUB_HEAD_REF (branch name) here, to retrieve the last commit on
    // the head branch rather than the merge commit (GITHUB_SHA).
    commit = await getCommit(ctx, GITHUB_HEAD_REF).catch((err) => {
      log.warn(noCommitDetails({ ref: GITHUB_HEAD_REF, sha: GITHUB_SHA, env: 'GITHUB_HEAD_REF' }));
      log.debug(err);
      return { commit: GITHUB_SHA, committedAt: Date.now() };
    });
    commit.mergeCommit = GITHUB_SHA;
    branch = GITHUB_HEAD_REF;
    slug = GITHUB_REPOSITORY;
  }

  const ciService = process.env.CHROMATIC_ACTION ? 'chromaui/action' : service;
  slug = slug || ciSlug;

  // On certain CI systems, a branch is not checked out
  // (instead a detached head is used for the commit).
  if (!notHead(branch)) {
    commit = await getCommit(ctx, ciCommit).catch((err) => {
      log.warn(noCommitDetails({ sha: ciCommit }));
      log.debug(err);
      return { commit: ciCommit, committedAt: Date.now() };
    });
    branch =
      notHead(prBranch) ||
      notHead(ciBranch) ||
      notHead(process.env.HEAD) || // https://www.netlify.com/docs/continuous-deployment/
      notHead(process.env.GERRIT_BRANCH) || // https://wiki.jenkins.io/display/JENKINS/Gerrit+Trigger
      notHead(process.env.GITHUB_REF) || // https://docs.github.com/en/free-pro-team@latest/actions/reference/environment-variables#default-environment-variables
      notHead(process.env.CI_BRANCH) ||
      'HEAD';
  }

  const fromCI =
    isCi ||
    !!ci ||
    !!process.env.CI ||
    !!process.env.REPOSITORY_URL || // https://www.netlify.com/docs/continuous-deployment/
    !!process.env.GITHUB_REPOSITORY;

  // Strip off any `origin/` prefix that's added sometimes.
  if (!branchName && !isFromEnvironmentVariable && ORIGIN_PREFIX_REGEXP.test(branch)) {
    log.warn(`Ignoring 'origin/' prefix in branch name.`);
    branch = branch.replace(ORIGIN_PREFIX_REGEXP, '');
  }

  // When a PR is put into a merge queue, and prior PR is merged, the PR is retested against the latest on main.
  // To do this, GitHub creates a new commit and does a CI run with the branch changed to e.g. gh-readonly-queue/main/pr-4-da07417adc889156224d03a7466ac712c647cd36
  // If you configure merge queues to rebase in this circumstance,
  // we lose track of baselines as the branch name has changed so our usual rebase detection (based on branch name) doesn't work.
  const mergeQueueBranchPrNumber = await mergeQueueBranchMatch(ctx, branch);
  if (mergeQueueBranchPrNumber) {
    // This is why we extract the PR number from the branch name and use it to find the branch name of the PR that was merged.
    const branchFromMergeQueuePullRequestNumber = await getBranchFromMergeQueuePullRequestNumber(
      ctx,
      { number: mergeQueueBranchPrNumber }
    );

    if (branchFromMergeQueuePullRequestNumber) {
      branch = branchFromMergeQueuePullRequestNumber;
    }
  }

  log.debug(
    `git info: ${JSON.stringify({
      commit,
      branch,
      slug,
      fromCI,
      ciService,
    })}`
  );

  return {
    ...commit,
    branch,
    slug,
    fromCI,
    ciService,
  };
}
