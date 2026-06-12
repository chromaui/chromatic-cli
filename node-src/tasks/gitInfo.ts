/* eslint max-lines: ["error", 550] */

import { getBaselineBuilds } from '../git/getBaselineBuilds';
import { getChangedFilesWithReplacement } from '../git/getChangedFilesWithReplacement';
import getCommitAndBranch from '../git/getCommitAndBranch';
import { getParentCommits } from '../git/getParentCommits';
import {
  getCommittedFileCount,
  getNumberOfCommitters,
  getRepositoryCreationDate,
  getRepositoryRoot,
  getSlug,
  getStorybookCreationDate,
  getUncommittedHash,
  getUserEmail,
  getVersion,
} from '../git/git';
import { getHasRouter } from '../lib/getHasRouter';
import matchesBranch from '../lib/matchesBranch';
import { exitCodes, setExitCode } from '../lib/setExitCode';
import { captureBailException } from '../lib/turbosnap/captureBailException';
import { classifyInvalidChangedFilesDetail } from '../lib/turbosnap/classifyBailDetail';
import { isPackageMetadataFile, matchesFile } from '../lib/utilities';
import {
  BaselineBuild,
  Context,
  Deps,
  Git,
  ProjectMetadata,
  TaskResult,
  TurboSnap,
} from '../types';
import gitUserEmailNotFound from '../ui/messages/errors/gitUserEmailNotFound';
import forceRebuildHint from '../ui/messages/info/forceRebuildHint';
import replacedBuild from '../ui/messages/info/replacedBuild';
import externalsChanged from '../ui/messages/warnings/externalsChanged';
import invalidChangedFiles from '../ui/messages/warnings/invalidChangedFiles';
import isRebuild from '../ui/messages/warnings/isRebuild';
import undefinedBranchOwner from '../ui/messages/warnings/undefinedBranchOwner';
import { skipFailed, skippingBuild } from '../ui/tasks/gitInfo';

export type GitInfoDeps = Pick<
  Deps,
  'log' | 'client' | 'options' | 'runtime' | 'packageJson' | 'report'
>;

export interface GitInfoInput {
  branchName?: string;
  ownerName?: string;
  repositorySlug?: string;
  patchBaseRef?: string;
  fromCI: boolean;
  interactive: boolean;
  isLocalBuild: boolean;
  skip: boolean | string;
  ignoreLastBuildOnBranch?: string;
  onlyChanged: boolean | string;
  externals?: string[];
  untraced?: string[];
}

type LastBuild = NonNullable<Context['rebuildForBuild']>;

export interface GitInfoOutput {
  git: Git;
  projectMetadata: ProjectMetadata;
  isOnboarding: boolean;
  turboSnap?: TurboSnap;
  build?: BaselineBuild;
  setForceRebuild: boolean;
  rebuildForBuildId?: string;
}

export type GitInfoPartial =
  | { phase: 'skip-commit'; git: Git; projectMetadata: ProjectMetadata }
  | {
      phase: 'rebuild-noop';
      git: Git;
      projectMetadata: ProjectMetadata;
      isOnboarding: boolean;
      rebuildForBuildId: string;
      rebuildForBuild: LastBuild;
      storybookUrl: string;
      setForceRebuild: boolean;
    };

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
        specCount
        componentCount
        testCount
        changeCount
        errorCount: testCount(statuses: [BROKEN])
        actualTestCount: testCount(statuses: [IN_PROGRESS])
        actualCaptureCount
        inheritedCaptureCount
        interactionTestFailuresCount
      }
    }
  }
`;
interface LastBuildQueryResult {
  app: {
    isOnboarding: boolean;
    lastBuild: LastBuild;
  };
}

/**
 * Gather all the git information needed for the build.
 *
 * @param deps Narrow set of cross-cutting dependencies the task needs.
 * @param input Per-pipeline-run input extracted from Context at the seam.
 *
 * @returns A TaskResult conveying the produced git/projectMetadata/turboSnap
 * state, or a partial outcome (skip-for-commit or rebuild-noop).
 */
// eslint-disable-next-line complexity, max-statements
export async function gatherGitInfo(
  deps: GitInfoDeps,
  input: GitInfoInput
): Promise<TaskResult<GitInfoOutput, GitInfoPartial>> {
  const { log, client, options, runtime, packageJson, report } = deps;
  const {
    branchName,
    ownerName,
    repositorySlug,
    patchBaseRef,
    fromCI,
    interactive,
    isLocalBuild,
    skip,
    ignoreLastBuildOnBranch,
    onlyChanged,
    externals,
    untraced,
  } = input;

  const version = await getVersion({ log, options });
  const commitAndBranchInfo = await getCommitAndBranch(
    { log, options },
    { branchName, patchBaseRef, ci: fromCI }
  );

  const git: Git = {
    version,
    gitUserEmail: await getUserEmail({ log, options }).catch((err) => {
      log.debug('Failed to retrieve Git user email', err);
      return undefined;
    }),
    uncommittedHash: await getUncommittedHash({ log, options }).catch((err) => {
      log.warn('Failed to retrieve uncommitted files hash', err);
      return undefined;
    }),
    rootPath: await getRepositoryRoot({ log, options }),
    ...commitAndBranchInfo,
  };

  let projectMetadata: ProjectMetadata = {};
  try {
    projectMetadata = {
      hasRouter: getHasRouter(packageJson),
      creationDate: await getRepositoryCreationDate({ log, options }),
      storybookCreationDate: await getStorybookCreationDate({ log, options }),
      numberOfCommitters: await getNumberOfCommitters({ log, options }),
      numberOfAppFiles: await getCommittedFileCount(
        { log, options },
        ['page', 'screen'],
        ['js', 'jsx', 'ts', 'tsx']
      ),
    };
  } catch (err) {
    log.debug('Failed to gather project metadata', err);
  }

  if (isLocalBuild && !git.gitUserEmail) {
    throw new Error(gitUserEmailNotFound());
  }

  if (!git.slug) {
    try {
      git.slug = await getSlug({ log, options });
    } catch (err) {
      log.debug('Failed to retrieve Git repository slug', err);
    }
  }

  if (ownerName) {
    git.branch = git.branch.replace(/[^:]+:/, '');
    git.slug = repositorySlug || git.slug?.replace(/[^/]+/, ownerName);
  } else if (UNDEFINED_BRANCH_PREFIX_REGEXP.test(git.branch)) {
    // Strip off `undefined:` owner prefix that we have seen in some CI systems.
    log.warn(undefinedBranchOwner());
    git.branch = git.branch.replace(UNDEFINED_BRANCH_PREFIX_REGEXP, '');
  }

  const { branch, commit, slug } = git;

  git.matchesBranch = (glob: string | boolean) => matchesBranch(branch, glob);

  if (git.matchesBranch(skip)) {
    const { title, output } = skippingBuild(git);
    report({ title, output });
    // The SkipBuildMutation ensures the commit is tagged properly.
    if (await client.runQuery(SkipBuildMutation, { commit, branch, slug })) {
      return {
        kind: 'partial',
        output: { phase: 'skip-commit', git, projectMetadata },
        reason: 'skipped-for-commit',
      };
    }
    throw new Error(skipFailed().output);
  }

  const parentCommits = await getParentCommits(
    { log, client, options },
    {
      git,
      ignoreLastBuildOnBranch: git.matchesBranch(ignoreLastBuildOnBranch || false),
    }
  );
  git.parentCommits = parentCommits;
  log.debug(`Found parentCommits: ${parentCommits.join(', ')}`);

  const result = await client.runQuery<LastBuildQueryResult>(LastBuildQuery, {
    commit,
    branch,
  });
  const isOnboarding = result.app.isOnboarding;

  // If we're running against the same commit as the sole parent, then this is likely a rebuild (rerun of CI job).
  // If the MRA is all green, there's no need to rerun the build, we just want the CLI to exit 0 so the CI job succeeds.
  // This is especially relevant for (unlinked) projects that don't use --exit-zero-on-changes.
  // There's no need for a SkipBuildMutation because we don't have to tag the commit again.
  let rebuildForBuildId: string | undefined;
  if (parentCommits.length === 1 && parentCommits[0] === commit) {
    const mostRecentAncestor = result?.app?.lastBuild;
    if (mostRecentAncestor) {
      rebuildForBuildId = mostRecentAncestor.id;
      if (
        ['PASSED', 'ACCEPTED'].includes(mostRecentAncestor.status) &&
        !git.matchesBranch(isOnboarding ? true : runtime.forceRebuild)
      ) {
        log.info(forceRebuildHint());
        return {
          kind: 'partial',
          output: {
            phase: 'rebuild-noop',
            git,
            projectMetadata,
            isOnboarding,
            rebuildForBuildId,
            rebuildForBuild: result.app.lastBuild,
            storybookUrl: result.app.lastBuild.storybookUrl,
            setForceRebuild: isOnboarding,
          },
          reason: 'rebuild-noop',
        };
      }
    }
  }

  const turboSnap: TurboSnap | undefined = git.matchesBranch(onlyChanged) ? {} : undefined;
  let build: BaselineBuild | undefined;

  // Retrieve a list of changed file paths since the actual baseline commit(s), which will be used
  // to determine affected story files later.
  // In the unlikely scenario that this list is empty (and not a rebuild), we can skip the build
  // since we know for certain it wouldn't have any effect. We do want to tag the commit.
  if (turboSnap) {
    if (parentCommits.length === 0) {
      turboSnap.bailReason = { noAncestorBuild: true };
      // Log warning after checking for isOnboarding
      return {
        kind: 'continue',
        output: {
          git,
          projectMetadata,
          isOnboarding,
          turboSnap,
          build,
          setForceRebuild: isOnboarding,
          rebuildForBuildId,
        },
      };
    }

    if (rebuildForBuildId) {
      turboSnap.bailReason = { rebuild: true };
      log.warn(isRebuild());
      return {
        kind: 'continue',
        output: {
          git,
          projectMetadata,
          isOnboarding,
          turboSnap,
          build,
          setForceRebuild: isOnboarding,
          rebuildForBuildId,
        },
      };
    }

    const baselineBuilds = await getBaselineBuilds(
      { options, client },
      { branch, parentCommits, git }
    );
    git.baselineCommits = baselineBuilds.map((build) => build.commit);
    log.debug(`Found baselineCommits: ${git.baselineCommits.join(', ')}`);

    // Use the most recent baseline to determine final CLI output if we end up skipping the build.
    // Note this will get overwritten if we end up not skipping the build.
    build = baselineBuilds.sort((a, b) => b.committedAt - a.committedAt)[0];

    try {
      // Map the baseline builds to their changed files, falling back to an earlier "replacement"
      // build if the baseline commit no longer exists or the baseline had uncommitted changes.
      const changedFilesWithInfo = await Promise.all(
        baselineBuilds.map(async (build) => {
          const changedFilesWithReplacement = await getChangedFilesWithReplacement(
            { log, client },
            build
          );
          return { build, ...changedFilesWithReplacement };
        })
      );

      // Take the distinct union of changed files across all baselines.
      git.changedFiles = [
        ...new Set(changedFilesWithInfo.flatMap(({ changedFiles }) => changedFiles)),
      ];

      // Track changed package manifest files along with the commit they were changed in.
      const untracedList = untraced ?? [];
      git.packageMetadataChanges = changedFilesWithInfo.flatMap(
        ({ build, changedFiles, replacementBuild }) => {
          const metadataFiles = changedFiles
            .filter((f) => !untracedList.some((glob) => matchesFile(glob, f)))
            .filter((f) => isPackageMetadataFile(f));

          return metadataFiles.length > 0
            ? [{ changedFiles: metadataFiles, commit: replacementBuild?.commit ?? build.commit }]
            : [];
        }
      );

      // Track replacement build info to pass along when we create the new build later on.
      git.replacementBuildIds = changedFilesWithInfo
        .filter((r) => !!r.replacementBuild)
        .map(({ build, replacementBuild }) => {
          log.info('');
          log.info(replacedBuild({ replacedBuild: build, replacementBuild }));
          // `replacementBuild` is filtered above
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          return [build.id, replacementBuild!.id];
        });

      if (!interactive) {
        const list =
          git.changedFiles.length > 0
            ? `:\n${git.changedFiles.map((f) => `  ${f}`).join('\n')}`
            : '';
        log.info(`Found ${git.changedFiles.length} changed files${list}`);
      }
    } catch (err) {
      const { bailSubreason } = classifyInvalidChangedFilesDetail(err);
      const sentryEventId = captureBailException(err, {
        bailSubreason,
        bailPath: 'gitInfo.invalidChangedFiles',
      });
      turboSnap.bailReason = { invalidChangedFiles: true, bailSubreason, sentryEventId };
      git.changedFiles = undefined;
      git.replacementBuildIds = undefined;
      log.warn(invalidChangedFiles());
      log.debug(err);
    }

    if (externals && git.changedFiles && git.changedFiles.length > 0) {
      for (const glob of externals) {
        const matches = git.changedFiles.filter((filepath) => matchesFile(glob, filepath));
        if (matches.length > 0) {
          turboSnap.bailReason = { changedExternalFiles: matches };
          log.warn(externalsChanged(matches));
          git.changedFiles = undefined;
          git.replacementBuildIds = undefined;
          break;
        }
      }
    }
  }

  return {
    kind: 'continue',
    output: {
      git,
      projectMetadata,
      isOnboarding,
      turboSnap,
      build,
      setForceRebuild: isOnboarding,
      rebuildForBuildId,
    },
  };
}

export const extractGitInfoInput = (ctx: Context): GitInfoInput => ({
  branchName: ctx.options.branchName,
  ownerName: ctx.options.ownerName,
  repositorySlug: ctx.options.repositorySlug,
  patchBaseRef: ctx.options.patchBaseRef,
  fromCI: ctx.options.fromCI,
  interactive: ctx.options.interactive,
  isLocalBuild: ctx.options.isLocalBuild,
  skip: ctx.options.skip,
  ignoreLastBuildOnBranch: ctx.options.ignoreLastBuildOnBranch,
  onlyChanged: ctx.options.onlyChanged,
  externals: ctx.options.externals,
  untraced: ctx.options.untraced,
});

export const applyGitInfoOutput = (ctx: Context, output: GitInfoOutput) => {
  ctx.git = output.git;
  ctx.projectMetadata = output.projectMetadata;
  ctx.isOnboarding = output.isOnboarding;
  if (output.turboSnap) ctx.turboSnap = output.turboSnap;
  // Have to cast as unknown first here, as there's not enough overlap to direct cast. This value gets overwritten
  // by the full build later in the pipeline. Could be worth a refactor to split out these types.
  if (output.build) ctx.build = output.build as unknown as Context['build'];
  if (output.rebuildForBuildId) ctx.rebuildForBuildId = output.rebuildForBuildId;
  if (output.setForceRebuild) ctx.runtime.forceRebuild = true;
};

export const applyGitInfoPartial = (ctx: Context, partial: GitInfoPartial) => {
  ctx.git = partial.git;
  ctx.projectMetadata = partial.projectMetadata;
  setExitCode(ctx, exitCodes.OK);
  if (partial.phase === 'rebuild-noop') {
    ctx.isOnboarding = partial.isOnboarding;
    ctx.rebuildForBuildId = partial.rebuildForBuildId;
    ctx.rebuildForBuild = partial.rebuildForBuild;
    ctx.storybookUrl = partial.storybookUrl;
    if (partial.setForceRebuild) ctx.runtime.forceRebuild = true;
  }
};
