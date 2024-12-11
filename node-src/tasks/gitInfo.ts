import picomatch from 'picomatch';

import { getBaselineBuilds } from '../git/getBaselineBuilds';
import { getChangedFilesWithReplacement } from '../git/getChangedFilesWithReplacement';
import getCommitAndBranch from '../git/getCommitAndBranch';
import { getParentCommits } from '../git/getParentCommits';
import {
  getCommittedFileCount,
  getNumberOfComitters,
  getRepositoryCreationDate,
  getRepositoryRoot,
  getSlug,
  getStorybookCreationDate,
  getUncommittedHash,
  getUserEmail,
  getVersion,
} from '../git/git';
import { getHasRouter } from '../lib/getHasRouter';
import { exitCodes, setExitCode } from '../lib/setExitCode';
import { createTask, transitionTo } from '../lib/tasks';
import { isPackageMetadataFile, matchesFile } from '../lib/utils';
import { Context, Task } from '../types';
import gitUserEmailNotFound from '../ui/messages/errors/gitUserEmailNotFound';
import forceRebuildHint from '../ui/messages/info/forceRebuildHint';
import replacedBuild from '../ui/messages/info/replacedBuild';
import externalsChanged from '../ui/messages/warnings/externalsChanged';
import invalidChangedFiles from '../ui/messages/warnings/invalidChangedFiles';
import isRebuild from '../ui/messages/warnings/isRebuild';
import undefinedBranchOwner from '../ui/messages/warnings/undefinedBranchOwner';
import {
  initial,
  pending,
  skipFailed,
  skippedForCommit,
  skippedRebuild,
  skippingBuild,
  success,
} from '../ui/tasks/gitInfo';

const UNDEFINED_BRANCH_PREFIX_REGEXP = /^undefined:/;

const SkipBuildMutation = `
  mutation SkipBuildMutation($commit: String!, $branch: String, $slug: String) {
    skipBuild(commit: $commit, branch: $branch, slug: $slug)
  }
`;

const LastBuildQuery = `
  query LastBuildQuery($commit: String!, $branch: String!) {
    app {
      isOnboarding
      lastBuild(ref: $commit, branch: $branch) {
        id
        status(legacy: false)
        storybookUrl
        webUrl
      }
    }
  }
`;
interface LastBuildQueryResult {
  app: {
    isOnboarding: boolean;
    lastBuild: {
      id: string;
      status: string;
      storybookUrl: string;
      webUrl: string;
    };
  };
}

// TODO: refactor this function
// eslint-disable-next-line complexity, max-statements
export const setGitInfo = async (ctx: Context, task: Task) => {
  const {
    branchName,
    ownerName,
    repositorySlug,
    patchBaseRef,
    fromCI: ci,
    interactive,
    isLocalBuild,
  } = ctx.options;

  const commitAndBranchInfo = await getCommitAndBranch(ctx, { branchName, patchBaseRef, ci });

  ctx.git = {
    version: await getVersion(),
    gitUserEmail: await getUserEmail().catch((err) => {
      ctx.log.debug('Failed to retrieve Git user email', err);
      return undefined;
    }),
    uncommittedHash: await getUncommittedHash().catch((err) => {
      ctx.log.warn('Failed to retrieve uncommitted files hash', err);
      return undefined;
    }),
    rootPath: await getRepositoryRoot(),
    ...commitAndBranchInfo,
  };

  try {
    ctx.projectMetadata = {
      hasRouter: getHasRouter(ctx.packageJson),
      creationDate: await getRepositoryCreationDate(),
      storybookCreationDate: await getStorybookCreationDate(ctx),
      numberOfCommitters: await getNumberOfComitters(),
      numberOfAppFiles: await getCommittedFileCount(['page', 'screen'], ['js', 'jsx', 'ts', 'tsx']),
    };
  } catch (err) {
    ctx.log.debug('Failed to gather project metadata', err);
  }

  if (isLocalBuild && !ctx.git.gitUserEmail) {
    throw new Error(gitUserEmailNotFound());
  }

  if (!ctx.git.slug) {
    try {
      ctx.git.slug = await getSlug();
    } catch (err) {
      ctx.log.debug('Failed to retrieve Git repository slug', err);
    }
  }

  if (ownerName) {
    ctx.git.branch = ctx.git.branch.replace(/[^:]+:/, '');
    ctx.git.slug = repositorySlug || ctx.git.slug?.replace(/[^/]+/, ownerName);
  } else if (UNDEFINED_BRANCH_PREFIX_REGEXP.test(ctx.git.branch)) {
    // Strip off `undefined:` owner prefix that we have seen in some CI systems.
    ctx.log.warn(undefinedBranchOwner());
    ctx.git.branch = ctx.git.branch.replace(UNDEFINED_BRANCH_PREFIX_REGEXP, '');
  }

  const { branch, commit, slug } = ctx.git;

  ctx.git.matchesBranch = (glob: string | boolean) =>
    typeof glob === 'string' && glob.length > 0 ? picomatch(glob, { bash: true })(branch) : !!glob;

  if (ctx.git.matchesBranch?.(ctx.options.skip)) {
    transitionTo(skippingBuild)(ctx, task);
    // The SkipBuildMutation ensures the commit is tagged properly.
    if (await ctx.client.runQuery(SkipBuildMutation, { commit, branch, slug })) {
      ctx.skip = true;
      transitionTo(skippedForCommit, true)(ctx, task);
      setExitCode(ctx, exitCodes.OK);
      return;
    }
    throw new Error(skipFailed().output);
  }

  const parentCommits = await getParentCommits(ctx, {
    ignoreLastBuildOnBranch: ctx.git.matchesBranch?.(ctx.options.ignoreLastBuildOnBranch || false),
  });
  ctx.git.parentCommits = parentCommits;
  ctx.log.debug(`Found parentCommits: ${parentCommits.join(', ')}`);

  const result = await ctx.client.runQuery<LastBuildQueryResult>(LastBuildQuery, {
    commit,
    branch,
  });
  ctx.isOnboarding = result.app.isOnboarding;
  if (result.app.isOnboarding) {
    ctx.options.forceRebuild = true;
  }
  // If we're running against the same commit as the sole parent, then this is likely a rebuild (rerun of CI job).
  // If the MRA is all green, there's no need to rerun the build, we just want the CLI to exit 0 so the CI job succeeds.
  // This is especially relevant for (unlinked) projects that don't use --exit-zero-on-changes.
  // There's no need for a SkipBuildMutation because we don't have to tag the commit again.
  if (parentCommits.length === 1 && parentCommits[0] === commit) {
    const mostRecentAncestor = result && result.app && result.app.lastBuild;
    if (mostRecentAncestor) {
      ctx.rebuildForBuildId = mostRecentAncestor.id;
      if (
        ['PASSED', 'ACCEPTED'].includes(mostRecentAncestor.status) &&
        !ctx.git.matchesBranch(ctx.options.forceRebuild)
      ) {
        ctx.skip = true;
        ctx.rebuildForBuild = result.app.lastBuild;
        ctx.storybookUrl = result.app.lastBuild.storybookUrl;
        transitionTo(skippedRebuild, true)(ctx, task);
        ctx.log.info(forceRebuildHint());
        ctx.exitCode = 0;
        return;
      }
    }
  }

  ctx.turboSnap = ctx.git.matchesBranch(ctx.options.onlyChanged) ? {} : undefined;

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
    ctx.git.baselineCommits = baselineBuilds.map((build) => build.commit);
    ctx.log.debug(`Found baselineCommits: ${ctx.git.baselineCommits.join(', ')}`);

    // Use the most recent baseline to determine final CLI output if we end up skipping the build.
    // Note this will get overwritten if we end up not skipping the build.
    ctx.build = baselineBuilds.sort((a, b) => b.committedAt - a.committedAt)[0] as any;

    try {
      // Map the baseline builds to their changed files, falling back to an earlier "replacement"
      // build if the baseline commit no longer exists or the baseline had uncommitted changes.
      const changedFilesWithInfo = await Promise.all(
        baselineBuilds.map(async (build) => {
          const changedFilesWithReplacement = await getChangedFilesWithReplacement(ctx, build);
          return { build, ...changedFilesWithReplacement };
        })
      );

      // Take the distinct union of changed files across all baselines.
      ctx.git.changedFiles = [
        ...new Set(changedFilesWithInfo.flatMap(({ changedFiles }) => changedFiles)),
      ];

      // Track changed package manifest files along with the commit they were changed in.
      const { untraced = [] } = ctx.options;
      ctx.git.packageMetadataChanges = changedFilesWithInfo.flatMap(
        ({ build, changedFiles, replacementBuild }) => {
          const metadataFiles = changedFiles
            .filter((f) => !untraced.some((glob) => matchesFile(glob, f)))
            .filter((f) => isPackageMetadataFile(f));

          return metadataFiles.length > 0
            ? [{ changedFiles: metadataFiles, commit: replacementBuild?.commit ?? build.commit }]
            : [];
        }
      );

      // Track replacement build info to pass along when we create the new build later on.
      ctx.git.replacementBuildIds = changedFilesWithInfo
        .filter((r) => !!r.replacementBuild)
        .map(({ build, replacementBuild }) => {
          ctx.log.info('');
          ctx.log.info(replacedBuild({ replacedBuild: build, replacementBuild }));
          // `replacementBuild` is filtered above
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          return [build.id, replacementBuild!.id];
        });

      if (!interactive) {
        const list =
          ctx.git.changedFiles.length > 0
            ? `:\n${ctx.git.changedFiles.map((f) => `  ${f}`).join('\n')}`
            : '';
        ctx.log.info(`Found ${ctx.git.changedFiles.length} changed files${list}`);
      }
    } catch (err) {
      ctx.turboSnap.bailReason = { invalidChangedFiles: true };
      delete ctx.git.changedFiles;
      delete ctx.git.replacementBuildIds;
      ctx.log.warn(invalidChangedFiles());
      ctx.log.debug(err);
    }

    if (ctx.options.externals && ctx.git.changedFiles && ctx.git.changedFiles.length > 0) {
      for (const glob of ctx.options.externals) {
        const matches = ctx.git.changedFiles.filter((filepath) => matchesFile(glob, filepath));
        if (matches.length > 0) {
          ctx.turboSnap.bailReason = { changedExternalFiles: matches };
          ctx.log.warn(externalsChanged(matches));
          delete ctx.git.changedFiles;
          delete ctx.git.replacementBuildIds;
          break;
        }
      }
    }
  }

  transitionTo(success, true)(ctx, task);
};

/**
 * Sets up the Listr task for gathering information from Git.
 *
 * @param _ The context set when executing the CLI.
 *
 * @returns A Listr task.
 */
export default function main(_: Context) {
  return createTask({
    name: 'gitInfo',
    title: initial.title,
    steps: [transitionTo(pending), setGitInfo],
  });
}
