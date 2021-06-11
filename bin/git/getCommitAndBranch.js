import envCi from 'env-ci';

import forksUnsupported from '../ui/messages/errors/forksUnsupported';
import gitOneCommit from '../ui/messages/errors/gitOneCommit';
import missingGitHubInfo from '../ui/messages/errors/missingGitHubInfo';
import missingTravisInfo from '../ui/messages/errors/missingTravisInfo';
import travisInternalBuild from '../ui/messages/warnings/travisInternalBuild';
import { getBranch, getCommit, hasPreviousCommit } from './git';

const ORIGIN_PREFIX_REGEXP = /^origin\//;
const notHead = (branch) => (branch && branch !== 'HEAD' ? branch : false);

export async function getCommitAndBranch({ branchName, patchBaseRef, ci, log } = {}) {
  // eslint-disable-next-line prefer-const
  let { commit, committedAt, committerEmail, committerName } = await getCommit();
  let branch = notHead(branchName) || notHead(patchBaseRef) || (await getBranch());
  let slug;

  const {
    TRAVIS_EVENT_TYPE,
    TRAVIS_PULL_REQUEST_SLUG,
    TRAVIS_REPO_SLUG,
    TRAVIS_PULL_REQUEST_SHA,
    TRAVIS_PULL_REQUEST_BRANCH,
    GITHUB_ACTIONS,
    GITHUB_EVENT_NAME,
    GITHUB_REPOSITORY,
    GITHUB_SHA,
    GITHUB_BASE_REF,
    GITHUB_HEAD_REF,
    CHROMATIC_SHA,
    CHROMATIC_BRANCH,
    CHROMATIC_SLUG,
  } = process.env;

  const isFromEnvVariable = CHROMATIC_SHA && CHROMATIC_BRANCH;
  const isTravisPrBuild = TRAVIS_EVENT_TYPE === 'pull_request';
  const isGitHubAction = GITHUB_ACTIONS === 'true';
  const isGitHubPrBuild = GITHUB_EVENT_NAME === 'pull_request';

  if (!(await hasPreviousCommit())) {
    throw new Error(gitOneCommit(isGitHubAction));
  }

  if (isTravisPrBuild && TRAVIS_PULL_REQUEST_SLUG === TRAVIS_REPO_SLUG) {
    log.warn(travisInternalBuild());
  }

  if (isFromEnvVariable) {
    // Our GitHub Action will also set these
    commit = CHROMATIC_SHA;
    branch = CHROMATIC_BRANCH;
    slug = CHROMATIC_SLUG;
  } else if (isTravisPrBuild) {
    // Travis PR builds are weird, we want to ensure we mark build against the commit that was
    // merged from, rather than the resulting "psuedo" merge commit that doesn't stick around in the
    // history of the project (so approvals will get lost). We also have to ensure we use the right branch.
    commit = TRAVIS_PULL_REQUEST_SHA;
    branch = TRAVIS_PULL_REQUEST_BRANCH;
    slug = TRAVIS_PULL_REQUEST_SLUG;
    if (!commit || !branch) {
      throw new Error(missingTravisInfo({ TRAVIS_EVENT_TYPE }));
    }
  } else if (isGitHubPrBuild) {
    // GitHub PR builds run against a "virtual merge commit" with a SHA unknown to Chromatic and an
    // invalid branch name, so we override these using environment variables available in the action.
    // This does not apply to our GitHub Action, because it'll set CHROMATIC_SHA, -BRANCH and -SLUG.
    if (!GITHUB_SHA || !GITHUB_HEAD_REF) {
      throw new Error(missingGitHubInfo({ GITHUB_EVENT_NAME }));
    }
    if (GITHUB_BASE_REF === GITHUB_HEAD_REF) {
      throw new Error(forksUnsupported({ GITHUB_HEAD_REF }));
    }
    commit = GITHUB_SHA;
    branch = GITHUB_HEAD_REF;
    slug = GITHUB_REPOSITORY;
  }

  const {
    isCi,
    service: ciService,
    prBranch,
    branch: ciBranch,
    commit: ciCommit,
    slug: ciSlug,
  } = envCi();
  slug = slug || ciSlug;

  // On certain CI systems, a branch is not checked out
  // (instead a detached head is used for the commit).
  if (!notHead(branch)) {
    commit = ciCommit;
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
  if (!branchName && !isFromEnvVariable && ORIGIN_PREFIX_REGEXP.test(branch)) {
    log.warn(`Ignoring 'origin/' prefix in branch name.`);
    branch = branch.replace(ORIGIN_PREFIX_REGEXP, '');
  }

  log.debug(
    `git info: ${JSON.stringify({
      commit,
      committedAt,
      committerEmail,
      committerName,
      branch,
      slug,
      isTravisPrBuild,
      fromCI,
      ciService,
    })}`
  );

  return {
    commit,
    committedAt,
    committerEmail,
    committerName,
    branch,
    slug,
    isTravisPrBuild,
    fromCI,
    ciService,
  };
}
