import picomatch from 'picomatch';

import { getCommitAndBranch } from '../git/getCommitAndBranch';
import { getBaselineCommits, getSlug, getVersion, getChangedFiles } from '../git/git';
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

const skipBuild = async (ctx, task) => {
  transitionTo(skippingBuild)(ctx, task);
  if (await ctx.client.runQuery(TesterSkipBuildMutation, { commit: ctx.git.commit })) {
    ctx.skip = true;
    return transitionTo(skippedForCommit, true)(ctx, task);
  }
  throw new Error(skipFailed(ctx).output);
};

export const setGitInfo = async (ctx, task) => {
  const { branchName, patchBaseRef, fromCI: ci } = ctx.options;
  ctx.git = await getCommitAndBranch({ branchName, patchBaseRef, ci, log: ctx.log });
  ctx.git.slug = ctx.git.slug || (await getSlug());
  ctx.git.version = await getVersion();

  if (ctx.options.ownerName) {
    ctx.git.slug = ctx.git.slug.replace(/[^/]+/, ctx.options.ownerName);
  }

  const { branch, commit } = ctx.git;

  const matchesBranch = (glob) => (glob && glob.length ? picomatch(glob)(branch) : !!glob);
  ctx.git.matchesBranch = matchesBranch;

  if (matchesBranch(ctx.options.skip)) {
    ctx.skipReason = '--skip';
    return skipBuild(ctx, task);
  }

  const baselineCommits = await getBaselineCommits(ctx, {
    branch,
    ignoreLastBuildOnBranch: matchesBranch(ctx.options.ignoreLastBuildOnBranch),
  });
  ctx.git.baselineCommits = baselineCommits;
  ctx.log.debug(`Found baselineCommits: ${baselineCommits}`);

  if (baselineCommits.length && ctx.options.ignoreChangedFiles) {
    const matchesFile = picomatch(ctx.options.ignoreChangedFiles);
    const changedFiles = await Promise.all(baselineCommits.map((c) => getChangedFiles(c, commit)));
    if ([...new Set(changedFiles)].every(matchesFile)) {
      ctx.skipReason = '--skip-files';
      return skipBuild(ctx, task);
    }
  }

  return transitionTo(success, true)(ctx, task);
};

export default createTask({
  title: initial.title,
  steps: [transitionTo(pending), setGitInfo],
});
