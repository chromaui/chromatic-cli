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
  skippedRebuild,
  success,
} from '../ui/tasks/gitInfo';

const TesterSkipBuildMutation = `
  mutation TesterSkipBuildMutation($commit: String!) {
    skipBuild(commit: $commit)
  }
`;

const TesterLastBuildQuery = `
  query TesterLastBuildQuery($commit: String!, $branch: String!) {
    app {
      lastBuild(ref: $commit, branch: $branch) {
        id
        status(legacy: false)
      }
    }
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
    // The SkipBuildMutation ensures the commit is tagged properly.
    if (await ctx.client.runQuery(TesterSkipBuildMutation, { commit })) {
      ctx.skip = true;
      transitionTo(skippedForCommit, true)(ctx, task);
      return;
    }
    throw new Error(skipFailed(ctx).output);
  }

  const baselineCommits = await getBaselineCommits(ctx, {
    ignoreLastBuildOnBranch: matchesBranch(ctx.options.ignoreLastBuildOnBranch),
  });
  ctx.git.baselineCommits = baselineCommits;
  ctx.log.debug(`Found baselineCommits: ${baselineCommits.join(', ')}`);

  // If the sole baseline is the most recent ancestor, then this is likely a rebuild (rerun of CI job).
  // If the MRA is all green, there's no need to rerun the build, we just want the CLI to exit 0 so the CI job succeeds.
  // This is especially relevant for (unlinked) projects that don't use --exit-zero-on-changes.
  // There's no need for a SkipBuildMutation because we don't have to tag the commit again.
  if (baselineCommits.length === 1 && baselineCommits[0] === commit) {
    const mostRecentAncestor = await ctx.client.runQuery(TesterLastBuildQuery, { commit, branch });
    if (mostRecentAncestor && ['PASSED', 'ACCEPTED'].includes(mostRecentAncestor.status)) {
      ctx.skip = true;
      transitionTo(skippedRebuild, true)(ctx, task);
      return;
    }
  }

  // Retrieve a list of changed file paths since the baseline commit(s), which will be used to
  // determine affected story files later.
  // In the unlikely scenario that this list is empty (and not a rebuild), we can skip the build
  // completely, since we know for certain it wouldn't have any effect.
  if (baselineCommits.length && matchesBranch(ctx.options.onlyChanged)) {
    const results = await Promise.all(baselineCommits.map((c) => getChangedFiles(c)));
    ctx.git.changedFiles = [...new Set(results.flat())].map((f) => `./${f}`);
    ctx.log.debug(`Found changedFiles:\n${ctx.git.changedFiles.map((f) => `  ${f}`).join('\n')}`);
    if (ctx.git.changedFiles.length === 0) {
      ctx.skip = true;
      transitionTo(skippedRebuild, true)(ctx, task);
      return;
    }
  }

  transitionTo(success, true)(ctx, task);
};

export default createTask({
  title: initial.title,
  steps: [transitionTo(pending), setGitInfo],
});
