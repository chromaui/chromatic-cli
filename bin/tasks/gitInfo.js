import picomatch from 'picomatch';

import { getCommitAndBranch } from '../git/getCommitAndBranch';
import { getBaselineCommits, getVersion } from '../git/git';
import { createTask, transitionTo } from '../lib/tasks';
import {
  initial,
  pending,
  skipFailed,
  skippedForCommit,
  skippingBuild,
  success,
} from '../ui/tasks/gitInfo';

const TesterSkipBuildMutation = `
  mutation TesterSkipBuildMutation($commit: String!) {
    skipBuild(commit: $commit)
  }
`;

export const setGitInfo = async (ctx, task) => {
  const { patchBaseRef, fromCI, ignoreLastBuildOnBranch, skip } = ctx.options;

  ctx.git = await getCommitAndBranch({ patchBaseRef, inputFromCI: fromCI, log: ctx.log });
  ctx.git.version = await getVersion();
  const { branch, commit } = ctx.git;

  const matchesBranch = glob => (glob && glob.length ? picomatch(glob)(branch) : !!glob);
  ctx.git.matchesBranch = matchesBranch;

  if (matchesBranch(skip)) {
    transitionTo(skippingBuild)(ctx, task);
    if (await ctx.client.runQuery(TesterSkipBuildMutation, { commit })) {
      ctx.skip = true;
      return transitionTo(skippedForCommit, true)(ctx, task);
    }
    throw new Error(skipFailed(ctx).output);
  }

  const baselineCommits = await getBaselineCommits(ctx, {
    branch,
    ignoreLastBuildOnBranch: matchesBranch(ignoreLastBuildOnBranch),
  });
  ctx.git.baselineCommits = baselineCommits;
  ctx.log.debug(`Found baselineCommits: ${baselineCommits}`);

  return transitionTo(success, true)(ctx, task);
};

export default createTask({
  title: initial.title,
  steps: [transitionTo(pending), setGitInfo],
});
