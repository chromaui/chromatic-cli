import envCi from 'env-ci';
import { stripIndents } from 'common-tags';
import setupDebug from 'debug';
import { getCommit, getBranch } from './git';
import log from '../lib/log';

export const debug = setupDebug('chromatic-cli:tester');

export async function getCommitAndBranch({ inputFromCI } = {}) {
  // eslint-disable-next-line prefer-const
  let { commit, committedAt, committerEmail, committerName } = await getCommit();
  let branch = await getBranch();
  const isTravisPrBuild = process.env.TRAVIS_EVENT_TYPE === 'pull_request';
  const {
    TRAVIS_EVENT_TYPE,
    TRAVIS_PULL_REQUEST_SLUG,
    TRAVIS_REPO_SLUG,
    TRAVIS_PULL_REQUEST_SHA,
    TRAVIS_PULL_REQUEST_BRANCH,
  } = process.env;
  if (TRAVIS_EVENT_TYPE === 'pull_request' && TRAVIS_PULL_REQUEST_SLUG === TRAVIS_REPO_SLUG) {
    log.warn(stripIndents`
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
      throw new Error(stripIndents`
        \`TRAVIS_EVENT_TYPE\` environment variable set to 'pull_request', 
        but \`TRAVIS_PULL_REQUEST_SHA\` and \`TRAVIS_PULL_REQUEST_BRANCH\` are not both set.

        Read more here: https://docs.chromaticqa.com/setup_ci#travis
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
        process.env.HEAD || process.env.GERRIT_BRANCH || process.env.CI_BRANCH || branch || 'HEAD';
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
