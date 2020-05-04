import pluralize from 'pluralize';
import { createTask, setTitle } from '../lib/tasks';
import { getCommitAndBranch } from '../git/getCommitAndBranch';
import { getBaselineCommits, getVersion } from '../git/git';

const infoMessage = ({ commit, branch, baselineCommits }) => {
  const info = `Commit ${commit.substr(0, 7)} on branch ${branch}`;
  return baselineCommits.length
    ? `${info}; found ${pluralize('baseline commit', baselineCommits.length, true)}`
    : `${info}; no baseline commits found`;
};

const fetchGitInfo = async ctx => {
  const { patchBaseRef, fromCI, ignoreLastBuildOnBranch } = ctx.options;
  ctx.git = await getCommitAndBranch({ patchBaseRef, inputFromCI: fromCI });
  ctx.git.version = await getVersion();
  ctx.git.baselineCommits = await getBaselineCommits(ctx.client, {
    branch: ctx.git.branch,
    ignoreLastBuildOnBranch:
      typeof ignoreLastBuildOnBranch === 'string'
        ? ignoreLastBuildOnBranch === ctx.git.branch
        : ignoreLastBuildOnBranch,
  });
  ctx.log.debug(`Found baselineCommits: ${ctx.git.baselineCommits}`);
};

export default createTask({
  title: 'Retrieve git information',
  steps: [
    setTitle('Retrieving git information'),
    fetchGitInfo,
    setTitle('Retrieved git information', ctx => infoMessage(ctx.git)),
  ],
});
