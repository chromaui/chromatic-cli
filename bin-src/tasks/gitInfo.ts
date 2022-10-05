import picomatch from 'picomatch';

import getCommitAndBranch from '../git/getCommitAndBranch';
import { execGitCommand, getSlug, getVersion } from '../git/git';
import { getParentCommits } from '../git/getParentCommits';
import { getBaselineBuilds } from '../git/getBaselineBuilds';
import { exitCodes, setExitCode } from '../lib/setExitCode';
import { createTask, transitionTo } from '../lib/tasks';
import { matchesFile } from '../lib/utils';
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
import { Context, Task } from '../types';
import { getChangedFilesWithReplacement } from '../git/getChangedFilesWithReplacement';
import replacedBuild from '../ui/messages/info/replacedBuild';
import forceRebuildHint from '../ui/messages/info/forceRebuildHint';
import arePackageDependenciesEqual from '../lib/comparePackageJsons';

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
    };
  };
}

export const setGitInfo = async (ctx: Context, task: Task) => {
  const { branchName, patchBaseRef, fromCI: ci, interactive } = ctx.options;

  ctx.git = {
    version: await getVersion(),
    ...(await getCommitAndBranch(ctx, { branchName, patchBaseRef, ci })),
  };

  if (!ctx.git.slug) {
    await getSlug().then(
      (slug) => {
        ctx.git.slug = slug;
      },
      (e) => ctx.log.warn('Failed to retrieve slug', e)
    );
  }

  if (ctx.git.slug && ctx.options.ownerName) {
    ctx.git.slug = ctx.git.slug.replace(/[^/]+/, ctx.options.ownerName);
  }

  const { branch, commit, slug } = ctx.git;

  ctx.git.matchesBranch = (glob: true | string) =>
    typeof glob === 'string' && glob.length ? picomatch(glob, { bash: true })(branch) : !!glob;

  if (ctx.git.matchesBranch(ctx.options.skip)) {
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
    ignoreLastBuildOnBranch: ctx.git.matchesBranch(ctx.options.ignoreLastBuildOnBranch),
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
      const results = await Promise.all(
        baselineBuilds.map(async (build) => ({
          build,
          ...(await getChangedFilesWithReplacement(ctx, build)),
        }))
      );
      ctx.git.changedFiles = Array.from(new Set(results.flatMap((r) => r.changedFiles)));
      ctx.git.replacementBuildIds = results
        .filter((r) => !!r.replacementBuild)
        .map(({ build, replacementBuild }) => {
          ctx.log.info('');
          ctx.log.info(replacedBuild({ replacedBuild: build, replacementBuild }));
          return [build.id, replacementBuild.id];
        });
      if (!interactive) {
        ctx.log.info(
          `Found ${ctx.git.changedFiles.length} changed files:\n${ctx.git.changedFiles
            .map((f) => `  ${f}`)
            .join('\n')}`
        );
      }

      const changedPackageFiles = ctx.git.changedFiles.filter((fileName) =>
        [/^package\.json$/, /\/package\.json$/].some((re) => re.test(fileName))
      );

      if (changedPackageFiles.length > 0) {
        ctx.git.packageControlFilesWithDependencyChanges = await getPackageManagerChanges(
          ctx.build,
          changedPackageFiles
        );
      }
    } catch (e) {
      ctx.turboSnap.bailReason = { invalidChangedFiles: true };
      ctx.git.changedFiles = null;
      ctx.log.warn(invalidChangedFiles());
      ctx.log.debug(e);
    }

    if (ctx.options.externals && ctx.git.changedFiles && ctx.git.changedFiles.length) {
      // eslint-disable-next-line no-restricted-syntax
      for (const glob of ctx.options.externals) {
        const matches = ctx.git.changedFiles.filter((filepath) => matchesFile(glob, filepath));
        if (matches.length) {
          ctx.turboSnap.bailReason = { changedExternalFiles: matches };
          ctx.log.warn(externalsChanged(matches));
          ctx.git.changedFiles = null;
          break;
        }
      }
    }
  }

  transitionTo(success, true)(ctx, task);
};

const getPackageManagerChanges = async (
  // TODO: type of build
  build,
  changedPackageFiles: string[]
): Promise<string[]> => {
  const allChanges = await Promise.all(
    changedPackageFiles.map(async (fileName) => {
      const fileA = await execGitCommand(`git show ${build.commit}:${fileName}`);
      const fileB = await execGitCommand(`git show HEAD:${fileName}`);

      return {
        fileName,
        sameDependencies: arePackageDependenciesEqual(JSON.parse(fileA), JSON.parse(fileB)),
      };
    })
  );

  return allChanges.filter((change) => !change.sameDependencies).map((change) => change.fileName);
};

export default createTask({
  title: initial.title,
  steps: [transitionTo(pending), setGitInfo],
});
