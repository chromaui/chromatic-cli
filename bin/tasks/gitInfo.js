import picomatch from 'picomatch';

import { getCommitAndBranch } from '../git/getCommitAndBranch';
import { getBaselineCommits, getChangedFiles, getSlug, getVersion } from '../git/git';
import { createTask, transitionTo } from '../lib/tasks';
import {
  initial,
  pending,
  skipFailed,
  skippingBuild,
  skippedForCommit,
  success,
} from '../ui/tasks/gitInfo';

const TesterSkipBuildMutation = `
  mutation TesterSkipBuildMutation($commit: String!) {
    skipBuild(commit: $commit)
  }
`;

export const setGitInfo = async (ctx, task) => {
  const { branchName, patchBaseRef, fromCI: ci } = ctx.options;
  ctx.git = await getCommitAndBranch({ branchName, patchBaseRef, ci, log: ctx.log });
  ctx.git.version = await getVersion();
  if (!ctx.git.slug) {
    ctx.git.slug = await getSlug().catch((e) => ctx.log.warn('Failed to retrieve slug', e));
  }

  if (ctx.git.slug && ctx.options.ownerName) {
    ctx.git.slug = ctx.git.slug.replace(/[^/]+/, ctx.options.ownerName);
  }

  const { branch, commit } = ctx.git;

  const matchesBranch = (glob) => (glob && glob.length ? picomatch(glob)(branch) : !!glob);
  ctx.git.matchesBranch = matchesBranch;

  if (matchesBranch(ctx.options.skip)) {
    transitionTo(skippingBuild)(ctx, task);
    if (await ctx.client.runQuery(TesterSkipBuildMutation, { commit })) {
      ctx.skip = true;
      return transitionTo(skippedForCommit, true)(ctx, task);
    }
    throw new Error(skipFailed(ctx).output);
  }

  const baselineCommits = await getBaselineCommits(ctx, {
    branch,
    ignoreLastBuildOnBranch: matchesBranch(ctx.options.ignoreLastBuildOnBranch),
  });
  ctx.git.baselineCommits = baselineCommits;
  ctx.log.debug(`Found baselineCommits: ${baselineCommits.join(', ')}`);

  if (baselineCommits.length && matchesBranch(ctx.options.onlyChanged)) {
    const results = await Promise.all(baselineCommits.map((c) => getChangedFiles(c)));
    ctx.git.changedFiles = [...new Set(results.flat())].map((f) => `./${f}`);
    ctx.log.debug(`Found changedFiles:\n${ctx.git.changedFiles.map((f) => `  ${f}`).join('\n')}`);
  }

  return transitionTo(success, true)(ctx, task);
};

export default createTask({
  title: initial.title,
  steps: [transitionTo(pending), setGitInfo],
});
