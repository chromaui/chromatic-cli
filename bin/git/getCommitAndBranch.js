import envCi from 'env-ci';

import gitOneCommit from '../ui/messages/errors/gitOneCommit';
import missingGitHubInfo from '../ui/messages/errors/missingGitHubInfo';
import missingTravisInfo from '../ui/messages/errors/missingTravisInfo';
import travisInternalBuild from '../ui/messages/warnings/travisInternalBuild';
import { getBranch, getCommit, hasPreviousCommit } from './git';

const notHead = (branch) => (branch && branch !== 'HEAD' ? branch : false);

export async function getCommitAndBranch({ branchName, patchBaseRef, ci, log } = {}) {
  // eslint-disable-next-line prefer-const
  let { commit, committedAt, committerEmail, committerName } = await getCommit();
  let branch = notHead(branchName) || notHead(patchBaseRef) || (await getBranch());

  const {
    TRAVIS_EVENT_TYPE,
    TRAVIS_PULL_REQUEST_SLUG,
    TRAVIS_REPO_SLUG,
    TRAVIS_PULL_REQUEST_SHA,
    TRAVIS_PULL_REQUEST_BRANCH,
    GITHUB_ACTIONS,
    GITHUB_WORKFLOW,
    GITHUB_SHA,
    GITHUB_REF,
    CHROMATIC_SHA,
    CHROMATIC_BRANCH,
  } = process.env;

  const isFromEnvVariable = CHROMATIC_SHA && CHROMATIC_BRANCH;
  const isTravisPrBuild = TRAVIS_EVENT_TYPE === 'pull_request';
  const isGitHubAction = GITHUB_ACTIONS === 'true';
  const isGitHubPrBuild = GITHUB_WORKFLOW;

  if (!(await hasPreviousCommit())) {
    throw new Error(gitOneCommit(isGitHubAction));
  }

  if (isTravisPrBuild && TRAVIS_PULL_REQUEST_SLUG === TRAVIS_REPO_SLUG) {
    log.warn(travisInternalBuild());
  }

  if (isFromEnvVariable) {
    commit = CHROMATIC_SHA;
    branch = CHROMATIC_BRANCH;
  } else if (isTravisPrBuild) {
    // Travis PR builds are weird, we want to ensure we mark build against the commit that was
    // merged from, rather than the resulting "psuedo" merge commit that doesn't stick around in the
    // history of the project (so approvals will get lost). We also have to ensure we use the right branch.
    commit = TRAVIS_PULL_REQUEST_SHA;
    branch = TRAVIS_PULL_REQUEST_BRANCH;
    if (!commit || !branch) {
      throw new Error(missingTravisInfo({ TRAVIS_EVENT_TYPE }));
    }
  } else if (isGitHubPrBuild) {
    // GitHub PR builds are weird. push events are fine, but PR in events, the sha will point to a not-yet-committed sha of a final merge.
    // This trips up chromatic, also the GITHUB_REF will be prefixed with 'refs/heads/' for some reason.
    commit = GITHUB_SHA;
    branch = GITHUB_REF.replace('refs/heads/', '');
    if (!commit || !branch) {
      throw new Error(missingGitHubInfo({ GITHUB_WORKFLOW }));
    }
  }

  // On certain CI systems, a branch is not checked out
  // (instead a detached head is used for the commit).
  if (!notHead(branch)) {
    const {
      prBranch: prBranchFromEnvCi,
      branch: branchFromEnvCi,
      commit: commitFromEnvCi,
    } = envCi();

    commit = commitFromEnvCi;

    // $HEAD is for netlify: https://www.netlify.com/docs/continuous-deployment/
    // $GERRIT_BRANCH is for Gerrit/Jenkins: https://wiki.jenkins.io/display/JENKINS/Gerrit+Trigger
    // $CI_BRANCH is a general setting that lots of systems use
    branch =
      notHead(prBranchFromEnvCi) ||
      notHead(branchFromEnvCi) ||
      notHead(process.env.HEAD) ||
      notHead(process.env.GERRIT_BRANCH) ||
      notHead(process.env.CI_BRANCH) ||
      notHead(process.env.GITHUB_REF) ||
      'HEAD';
  }

  // REPOSITORY_URL is for netlify: https://www.netlify.com/docs/continuous-deployment/
  const fromCI =
    !!ci || !!process.env.CI || !!process.env.REPOSITORY_URL || !!process.env.GITHUB_REPOSITORY;

  log.debug(
    `git info: ${JSON.stringify({
      commit,
      committedAt,
      committerEmail,
      committerName,
      branch,
      isTravisPrBuild,
      fromCI,
    })}`
  );
  return { commit, committedAt, committerEmail, committerName, branch, isTravisPrBuild, fromCI };
}
