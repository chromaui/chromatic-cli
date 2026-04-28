import { execGitCommand } from '../../git/execGit';
import {
  checkout,
  checkoutFile,
  checkoutPrevious,
  commitExists,
  discardChanges,
  findFilesFromRepositoryRoot,
  findMergeBase,
  getBranch,
  getChangedFiles,
  getCommit,
  getCommittedFileCount,
  getNumberOfComitters,
  getRepositoryCreationDate,
  getRepositoryRoot,
  getSlug,
  getStorybookCreationDate,
  getUncommittedHash,
  getUpdateMessage,
  getUserEmail,
  getVersion,
  hasPreviousCommit,
  isClean,
  isUpToDate,
} from '../../git/git';
import { ExecCommandOptions, GitRepository } from './git';
import { Logger } from './logger';

interface ShellAdapterDeps {
  log: Logger;
}

/**
 * Construct a {@link GitRepository} backed by the local `git` executable.
 *
 * @param deps Runtime dependencies.
 * @param deps.log Logger forwarded to the underlying git helpers.
 *
 * @returns A GitRepository that shells out to the real git CLI.
 */
export function createShellGitAdapter(deps: ShellAdapterDeps): GitRepository {
  return {
    version: () => getVersion(deps),
    userEmail: () => getUserEmail(deps),
    slug: () => getSlug(deps),
    commit: (revision) => getCommit(deps, revision),
    async branch() {
      const result = await getBranch(deps);
      return result ?? 'HEAD';
    },
    uncommittedHash: () => getUncommittedHash(deps),
    hasPreviousCommit: () => hasPreviousCommit(deps).then(Boolean),
    commitExists: (commit) => commitExists(deps, commit),
    changedFiles: (baseCommit, headCommit) => getChangedFiles(deps, baseCommit, headCommit),
    isUpToDate: () => isUpToDate(deps),
    isClean: () => isClean(deps),
    getUpdateMessage: () => getUpdateMessage(deps),
    findMergeBase: (head, base) => findMergeBase(deps, head, base),
    checkout: (reference) => checkout(deps, reference),
    checkoutFile: (reference, fileName, tmpdir) => checkoutFile(deps, reference, fileName, tmpdir),
    checkoutPrevious: () => checkoutPrevious(deps),
    discardChanges: () => discardChanges(deps),
    repositoryRoot: () => getRepositoryRoot(deps),
    findFilesFromRepositoryRoot: (repoRoot, ...patterns) =>
      findFilesFromRepositoryRoot(deps, repoRoot, ...patterns),
    repositoryCreationDate: () => getRepositoryCreationDate(deps),
    storybookCreationDate: (configDirectory) =>
      getStorybookCreationDate({
        ...deps,
        options: { storybookConfigDir: configDirectory },
      }),
    committerCount: () => getNumberOfComitters(deps),
    committedFileCount: (nameMatches, extensions) =>
      getCommittedFileCount(deps, nameMatches, extensions),
    execCommand: (command, options?: ExecCommandOptions) => execGitCommand(deps, command, options),
  };
}
