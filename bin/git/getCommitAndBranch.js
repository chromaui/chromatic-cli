import envCi from 'env-ci';
import dedent from 'ts-dedent';
import setupDebug from 'debug';
import { getCommit, getBranch } from './git';
import log from '../lib/log';

export const debug = setupDebug('chromatic-cli:tester');

export async function getCommitAndBranch({ inputFromCI } = {}) {
  // eslint-disable-next-line prefer-const
  let { commit, committedAt, committerEmail, committerName } = await getCommit();
  let branch = await getBranch();

  const {
    TRAVIS_EVENT_TYPE,
    TRAVIS_PULL_REQUEST_SLUG,
    TRAVIS_REPO_SLUG,
    TRAVIS_PULL_REQUEST_SHA,
    TRAVIS_PULL_REQUEST_BRANCH,
    GITHUB_WORKFLOW,
    GITHUB_SHA,
    GITHUB_REF,
  } = process.env;

  const isTravisPrBuild = TRAVIS_EVENT_TYPE === 'pull_request';
  const isGitHubPrBuild = GITHUB_WORKFLOW !== '';

  if (isTravisPrBuild && TRAVIS_PULL_REQUEST_SLUG === TRAVIS_REPO_SLUG) {
    log.warn(dedent`
        WARNING: Running Chromatic on a Travis PR build from an internal branch.

        It is recommended to run Chromatic on the push builds from Travis where possible.
        We advise turning on push builds and disabling Chromatic for internal PR builds.
        Read more: https://docs.chromaticqa.com/setup_ci#travis
      `);
  }
  // Travis PR builds are weird, we want to ensure we mark build against the commit that was
  // merged from, rather than the resulting "psuedo" merge commit that doesn't stick around in the
  // history of the project (so approvals will get lost). We also have to ensure we use the right branch.
  if (isTravisPrBuild) {
    commit = TRAVIS_PULL_REQUEST_SHA;
    branch = TRAVIS_PULL_REQUEST_BRANCH;
    if (!commit || !branch) {
      throw new Error(dedent`
      \`TRAVIS_EVENT_TYPE\` environment variable set to '${TRAVIS_EVENT_TYPE}', 
      but \`TRAVIS_PULL_REQUEST_SHA\` and \`TRAVIS_PULL_REQUEST_BRANCH\` are not both set.
      
      Read more here: https://docs.chromaticqa.com/setup_ci#travis
      `);
    }
  }

  if (isGitHubPrBuild) {
    commit = GITHUB_SHA;
    branch = GITHUB_REF;
    if (!commit || !branch) {
      throw new Error(dedent`
        \`GITHUB_WORKFLOW\` environment variable set to '${GITHUB_WORKFLOW}', 
        but \`GITHUB_SHA\` and \`GITHUB_REF\` are not both set.

        Read more here: https://docs.chromaticqa.com/setup_ci#github
      `);
    }
  }
  // On certain CI systems, a branch is not checked out
  // (instead a detached head is used for the commit).
  if (branch === 'HEAD' || !branch) {
    ({ branch } = envCi());
    if (branch === 'HEAD' || !branch) {
      // $HEAD is for netlify: https://www.netlify.com/docs/continuous-deployment/
      // $GERRIT_BRANCH is for Gerrit/Jenkins: https://wiki.jenkins.io/display/JENKINS/Gerrit+Trigger
      // $CI_BRANCH is a general setting that lots of systems use
      branch =
        process.env.HEAD ||
        process.env.GERRIT_BRANCH ||
        process.env.CI_BRANCH ||
        process.env.GITHUB_REF ||
        branch ||
        'HEAD';
    }
  }
  // REPOSITORY_URL is for netlify: https://www.netlify.com/docs/continuous-deployment/
  const fromCI = inputFromCI || !!process.env.CI || !!process.env.REPOSITORY_URL;
  debug(
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
