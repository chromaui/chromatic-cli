import picomatch from 'picomatch';

import { getCommitAndBranch } from '../git/getCommitAndBranch';
import {
  getParentCommits,
  getBaselineBuilds,
  getChangedFiles,
  getSlug,
  getVersion,
} from '../git/git';
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
import externalsChanged from '../ui/messages/warnings/externalsChanged';
import invalidChangedFiles from '../ui/messages/warnings/invalidChangedFiles';
import isRebuild from '../ui/messages/warnings/isRebuild';
import { matchesFile } from '../lib/utils';

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
  const { branchName, patchBaseRef, fromCI: ci, interactive } = ctx.options;
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
      ctx.exitCode = 0;
      return;
    }
    throw new Error(skipFailed(ctx).output);
  }

  const parentCommits = await getParentCommits(ctx, {
    ignoreLastBuildOnBranch: matchesBranch(ctx.options.ignoreLastBuildOnBranch),
  });
  ctx.git.parentCommits = parentCommits;
  ctx.log.debug(`Found parentCommits: ${parentCommits.join(', ')}`);

  // If we're running against the same commit as the sole parent, then this is likely a rebuild (rerun of CI job).
  // If the MRA is all green, there's no need to rerun the build, we just want the CLI to exit 0 so the CI job succeeds.
  // This is especially relevant for (unlinked) projects that don't use --exit-zero-on-changes.
  // There's no need for a SkipBuildMutation because we don't have to tag the commit again.
  if (parentCommits.length === 1 && parentCommits[0] === commit) {
    const result = await ctx.client.runQuery(TesterLastBuildQuery, { commit, branch });
    const mostRecentAncestor = result?.app?.lastBuild;
    if (mostRecentAncestor) {
      ctx.rebuildForBuildId = mostRecentAncestor.id;
      if (['PASSED', 'ACCEPTED'].includes(mostRecentAncestor.status)) {
        ctx.skip = true;
        transitionTo(skippedRebuild, true)(ctx, task);
        return;
      }
    }
  }

  ctx.turboSnap = matchesBranch(ctx.options.onlyChanged) ? {} : false;

  // Retrieve a list of changed file paths since the actual baseline commit(s), which will be used
  // to determine affected story files later.
  // In the unlikely scenario that this list is empty (and not a rebuild), we can skip the build
  // since we know for certain it wouldn't have any effect. We do want to tag the commit.
  if (ctx.turboSnap) {
    if (parentCommits.length === 0) {
      ctx.turboSnap.bailReason = { noAncestorBuild: true };
      // Log warning after checking for isOnboarding
      transitionTo(success, true)(ctx, task);
      return;
    }

    if (ctx.rebuildForBuildId) {
      ctx.turboSnap.bailReason = { rebuild: true };
      ctx.log.warn(isRebuild());
      transitionTo(success, true)(ctx, task);
      return;
    }

    const baselineBuilds = await getBaselineBuilds(ctx, { branch, parentCommits });
    const baselineCommits = baselineBuilds.map((build) => build.commit);
    ctx.log.debug(`Found baselineCommits: ${baselineCommits.join(', ')}`);

    // Use the most recent baseline to determine final CLI output if we end up skipping the build.
    // Note this will get overwritten if we end up not skipping the build.
    // eslint-disable-next-line prefer-destructuring
    ctx.build = baselineBuilds.sort((a, b) => b.committedAt - a.committedAt)[0];

    try {
      const results = await Promise.all(baselineCommits.map((c) => getChangedFiles(c)));
      ctx.git.changedFiles = [...new Set(results.flat())];
      if (!interactive) {
        ctx.log.info(
          `Found ${ctx.git.changedFiles.length} changed files:\n${ctx.git.changedFiles
            .map((f) => `  ${f}`)
            .join('\n')}`
        );
      }
    } catch (e) {
      console.log(e);
      ctx.turboSnap.bailReason = { invalidChangedFiles: true };
      ctx.git.changedFiles = null;
      ctx.log.warn(invalidChangedFiles());
      ctx.log.debug(e);
    }

    if (ctx.options.externals && ctx.git.changedFiles?.length) {
      // eslint-disable-next-line no-restricted-syntax
      for (const glob of ctx.options.externals) {
        const match = ctx.git.changedFiles.find((filepath) => matchesFile(glob, filepath));
        if (match) {
          ctx.turboSnap.bailReason = { changedExternalFile: match };
          ctx.log.warn(externalsChanged(match));
          ctx.git.changedFiles = null;
          break;
        }
      }
    }
  }

  transitionTo(success, true)(ctx, task);
};

export default createTask({
  title: initial.title,
  steps: [transitionTo(pending), setGitInfo],
});
