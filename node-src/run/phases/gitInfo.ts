import picomatch from 'picomatch';

import { getBaselineBuilds } from '../../git/getBaselineBuilds';
import { getChangedFilesWithReplacement } from '../../git/getChangedFilesWithReplacement';
import getCommitAndBranch from '../../git/getCommitAndBranch';
import { getParentCommits } from '../../git/getParentCommits';
import { getHasRouter } from '../../lib/getHasRouter';
import { Logger } from '../../lib/log';
import { Ports } from '../../lib/ports';
import { isPackageMetadataFile, matchesFile } from '../../lib/utilities';
import type { Context, Options, TurboSnap } from '../../types';
import gitUserEmailNotFound from '../../ui/messages/errors/gitUserEmailNotFound';
import replacedBuild from '../../ui/messages/info/replacedBuild';
import externalsChanged from '../../ui/messages/warnings/externalsChanged';
import invalidChangedFiles from '../../ui/messages/warnings/invalidChangedFiles';
import isRebuild from '../../ui/messages/warnings/isRebuild';
import undefinedBranchOwner from '../../ui/messages/warnings/undefinedBranchOwner';
import { skipFailed } from '../../ui/tasks/gitInfo';
import type { GitState, ProjectMetadata } from '../types';

const UNDEFINED_BRANCH_PREFIX_REGEXP = /^undefined:/;

/**
 * Discriminated outcome of running the gitInfo phase. The wrapping
 * orchestrator decides how to render UI transitions and exit codes from this.
 */
export type GitInfoOutcome =
  | { kind: 'skip-commit' }
  | {
      kind: 'skip-rebuild';
      rebuildForBuild: Context['rebuildForBuild'];
      storybookUrl?: string;
    }
  | {
      kind: 'continue';
      turboSnap?: TurboSnap;
      build?: Context['build'];
    };

export interface GitInfoPhaseInput {
  options: Options;
  packageJson: Context['packageJson'];
  log: Logger;
  ports: Pick<Ports, 'git' | 'chromatic'>;
}

export interface GitInfoPhaseOutput {
  git: GitState;
  projectMetadata: ProjectMetadata;
  isOnboarding: boolean;
  /** ID of the ancestor build this commit can rebuild against, if any. */
  rebuildForBuildId?: string;
  /** Resolved overrides the orchestrator should merge into options. */
  optionsOverride?: { forceRebuild?: boolean };
  outcome: GitInfoOutcome;
}

/**
 * Pure orchestration of the `gitInfo` phase. Reads exclusively from typed
 * input slices and the `git` / `chromatic` ports, returns a typed slice
 * describing the phase output. Side effects are limited to logging via the
 * supplied `log`.
 *
 * The wrapping Listr task in `node-src/tasks/gitInfo.ts` is responsible for
 * mapping the returned `outcome` to UI transitions and exit codes, and for
 * mirroring the slice onto the legacy `Context` so downstream phases keep
 * reading their inputs from `ctx.git` during the transition.
 *
 * @param input Phase inputs — resolved options, the project's `package.json`,
 * a logger, and the git/chromatic ports.
 *
 * @returns The accumulated `GitState`, project metadata, onboarding signal,
 * any required options override, and a discriminated outcome.
 */
// eslint-disable-next-line complexity, max-statements
export async function runGitInfoPhase(input: GitInfoPhaseInput): Promise<GitInfoPhaseOutput> {
  const { options, packageJson, log, ports } = input;

  // Transitional context object while helpers and downstream phases still expect it, will go away
  const helperContext = {
    log,
    options,
    ports,
    packageJson,
    git: undefined as unknown as Context['git'],
  } as unknown as Context;

  const git = await collectGit({ options, log, ports, helperContext });
  helperContext.git = git as Context['git'];
  const projectMetadata = await collectProjectMetadata({ options, packageJson, log, ports });

  if (options.isLocalBuild && !git.gitUserEmail) {
    throw new Error(gitUserEmailNotFound());
  }

  await applyOwnerAndSlug(git, options, log, ports);

  const matchesBranch = (glob: string | boolean) =>
    typeof glob === 'string' && glob.length > 0
      ? picomatch(glob, { bash: true })(git.branch)
      : !!glob;
  git.matchesBranch = matchesBranch;

  if (matchesBranch(options.skip)) {
    if (
      await ports.chromatic.skipBuild({
        commit: git.commit,
        branch: git.branch,
        slug: git.slug,
      })
    ) {
      return { git, projectMetadata, isOnboarding: false, outcome: { kind: 'skip-commit' } };
    }
    throw new Error(skipFailed().output);
  }

  const parentCommits = await getParentCommits(helperContext, {
    ignoreLastBuildOnBranch: matchesBranch(options.ignoreLastBuildOnBranch || false),
  });
  git.parentCommits = parentCommits;
  log.debug(`Found parentCommits: ${parentCommits.join(', ')}`);

  const lastBuildResult = await ports.chromatic.getLastBuildForCommit({
    commit: git.commit,
    branch: git.branch,
  });
  const isOnboarding = lastBuildResult.isOnboarding;
  const optionsOverride = isOnboarding ? { forceRebuild: true } : undefined;
  const effectiveForceRebuild = isOnboarding ? true : options.forceRebuild;

  let rebuildForBuildId: string | undefined;
  if (parentCommits.length === 1 && parentCommits[0] === git.commit) {
    const ancestor = lastBuildResult.lastBuild;
    if (ancestor) {
      rebuildForBuildId = ancestor.id;
      if (
        ['PASSED', 'ACCEPTED'].includes(ancestor.status) &&
        !matchesBranch(effectiveForceRebuild ?? false)
      ) {
        return {
          git,
          projectMetadata,
          isOnboarding,
          rebuildForBuildId,
          optionsOverride,
          outcome: {
            kind: 'skip-rebuild',
            rebuildForBuild: ancestor as Context['rebuildForBuild'],
            storybookUrl: ancestor.storybookUrl,
          },
        };
      }
    }
  }

  const turboSnap: TurboSnap | undefined = matchesBranch(options.onlyChanged) ? {} : undefined;
  if (!turboSnap) {
    return {
      git,
      projectMetadata,
      isOnboarding,
      rebuildForBuildId,
      optionsOverride,
      outcome: { kind: 'continue' },
    };
  }

  if (parentCommits.length === 0) {
    return {
      git,
      projectMetadata,
      isOnboarding,
      rebuildForBuildId,
      optionsOverride,
      outcome: {
        kind: 'continue',
        turboSnap: { ...turboSnap, bailReason: { noAncestorBuild: true } },
      },
    };
  }

  if (rebuildForBuildId) {
    log.warn(isRebuild());
    return {
      git,
      projectMetadata,
      isOnboarding,
      rebuildForBuildId,
      optionsOverride,
      outcome: {
        kind: 'continue',
        turboSnap: { ...turboSnap, bailReason: { rebuild: true } },
      },
    };
  }

  const baselineBuilds = await getBaselineBuilds(helperContext, {
    branch: git.branch,
    parentCommits,
  });
  git.baselineCommits = baselineBuilds.map((build) => build.commit);
  log.debug(`Found baselineCommits: ${git.baselineCommits.join(', ')}`);

  const baselineBuild = [...baselineBuilds].sort(
    (a, b) => b.committedAt - a.committedAt
  )[0] as unknown as Context['build'] | undefined;

  const bailReason = await collectChangedFiles({
    helperContext,
    git,
    baselineBuilds,
    options,
    log,
  });

  return {
    git,
    projectMetadata,
    isOnboarding,
    rebuildForBuildId,
    optionsOverride,
    outcome: {
      kind: 'continue',
      turboSnap: { ...turboSnap, ...(bailReason && { bailReason }) },
      build: baselineBuild,
    },
  };
}

async function collectGit(args: {
  options: Options;
  log: Logger;
  ports: Pick<Ports, 'git'>;
  helperContext: Context;
}): Promise<GitState> {
  const { options, log, ports, helperContext } = args;
  const { branchName, patchBaseRef, fromCI: ci } = options;

  const version = await ports.git.version();
  const commitAndBranchInfo = await getCommitAndBranch(helperContext, {
    branchName,
    patchBaseRef,
    ci,
  });
  const gitUserEmail = await ports.git.userEmail().catch((error) => {
    log.debug('Failed to retrieve Git user email', error);
    return undefined;
  });
  const uncommittedHash = await ports.git.uncommittedHash().catch((error) => {
    log.warn('Failed to retrieve uncommitted files hash', error);
    return undefined;
  });
  const rootPath = await ports.git.repositoryRoot();

  return { version, gitUserEmail, uncommittedHash, rootPath, ...commitAndBranchInfo };
}

async function collectProjectMetadata(args: {
  options: Options;
  packageJson: Context['packageJson'];
  log: Logger;
  ports: Pick<Ports, 'git'>;
}): Promise<ProjectMetadata> {
  const { options, packageJson, log, ports } = args;
  try {
    return {
      hasRouter: getHasRouter(packageJson),
      creationDate: await ports.git.repositoryCreationDate(),
      storybookCreationDate: await ports.git.storybookCreationDate(
        options.storybookConfigDir ?? '.storybook'
      ),
      numberOfCommitters: await ports.git.committerCount(),
      numberOfAppFiles: await ports.git.committedFileCount(
        ['page', 'screen'],
        ['js', 'jsx', 'ts', 'tsx']
      ),
    };
  } catch (error) {
    log.debug('Failed to gather project metadata', error);
    return {};
  }
}

async function applyOwnerAndSlug(
  git: GitState,
  options: Options,
  log: Logger,
  ports: Pick<Ports, 'git'>
) {
  if (!git.slug) {
    try {
      git.slug = await ports.git.slug();
    } catch (error) {
      log.debug('Failed to retrieve Git repository slug', error);
    }
  }

  if (options.ownerName) {
    git.branch = git.branch.replace(/[^:]+:/, '');
    git.slug = options.repositorySlug || git.slug?.replace(/[^/]+/, options.ownerName);
  } else if (UNDEFINED_BRANCH_PREFIX_REGEXP.test(git.branch)) {
    log.warn(undefinedBranchOwner());
    git.branch = git.branch.replace(UNDEFINED_BRANCH_PREFIX_REGEXP, '');
  }
}

async function collectChangedFiles(args: {
  helperContext: Context;
  git: GitState;
  baselineBuilds: Awaited<ReturnType<typeof getBaselineBuilds>>;
  options: Options;
  log: Logger;
}): Promise<TurboSnap['bailReason'] | undefined> {
  const { helperContext, git, baselineBuilds, options, log } = args;
  let bailReason: TurboSnap['bailReason'];

  try {
    const changedFilesWithInfo = await Promise.all(
      baselineBuilds.map(async (build) => {
        const changedFilesWithReplacement = await getChangedFilesWithReplacement(
          helperContext,
          build
        );
        return { build, ...changedFilesWithReplacement };
      })
    );

    git.changedFiles = [
      ...new Set(changedFilesWithInfo.flatMap(({ changedFiles }) => changedFiles)),
    ];

    const { untraced = [] } = options;
    git.packageMetadataChanges = changedFilesWithInfo.flatMap(
      ({ build, changedFiles, replacementBuild }) => {
        const metadataFiles = changedFiles
          .filter((f) => !untraced.some((glob) => matchesFile(glob, f)))
          .filter((f) => isPackageMetadataFile(f));
        return metadataFiles.length > 0
          ? [{ changedFiles: metadataFiles, commit: replacementBuild?.commit ?? build.commit }]
          : [];
      }
    );

    git.replacementBuildIds = changedFilesWithInfo
      .filter((r) => !!r.replacementBuild)
      .map(({ build, replacementBuild }) => {
        log.info('');
        log.info(replacedBuild({ replacedBuild: build, replacementBuild }));
        return [build.id, (replacementBuild as { id: string }).id];
      });

    if (!options.interactive) {
      const list =
        git.changedFiles.length > 0 ? `:\n${git.changedFiles.map((f) => `  ${f}`).join('\n')}` : '';
      log.info(`Found ${git.changedFiles.length} changed files${list}`);
    }
  } catch (error) {
    bailReason = { invalidChangedFiles: true };
    delete git.changedFiles;
    delete git.replacementBuildIds;
    log.warn(invalidChangedFiles());
    log.debug(error);
  }

  if (options.externals && git.changedFiles && git.changedFiles.length > 0) {
    for (const glob of options.externals) {
      const matches = git.changedFiles.filter((filepath) => matchesFile(glob, filepath));
      if (matches.length > 0) {
        bailReason = { changedExternalFiles: matches };
        log.warn(externalsChanged(matches));
        delete git.changedFiles;
        delete git.replacementBuildIds;
        break;
      }
    }
  }

  return bailReason;
}
