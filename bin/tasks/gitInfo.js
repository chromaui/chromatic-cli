import { createTask, transitionTo } from '../lib/tasks';
import { getCommitAndBranch } from '../git/getCommitAndBranch';
import { getBaselineCommits, getVersion } from '../git/git';
import { initial, pending, success } from '../ui/tasks/gitInfo';

const setGitInfo = async ctx => {
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
  title: initial.title,
  steps: [transitionTo(pending), setGitInfo, transitionTo(success, true)],
});
