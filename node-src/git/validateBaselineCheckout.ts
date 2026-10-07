import { exitCodes, TaskFailure } from '../lib/setExitCode';
import { execGitCommand, GitDeps } from './execGit';

/**
 * Reject uncommitted input before the CLI opens its own log file in the checkout.
 * Unlike an uncommitted-content hash, status also detects deleted files.
 *
 * @param deps Git command dependencies.
 */
export async function validateCleanCheckout(deps: GitDeps): Promise<void> {
  const status = await execGitCommand(
    deps,
    ['git', 'status', '--porcelain', '--untracked-files=normal', '--ignore-submodules=none'],
    { all: false }
  );
  if (status.trim()) {
    throw new TaskFailure(
      'Baseline workflows require a clean checkout. Commit or remove local changes and untracked files, then rerun the exact commit.',
      { exitCode: exitCodes.GIT_NOT_CLEAN, userError: true }
    );
  }
}

/**
 * Ensure the build input comes from the commit whose record will be announced.
 * Synthetic merge checkouts are outside the initial pilot scope.
 *
 * @param deps Git command dependencies.
 * @param testedCommit The resolved commit Chromatic will test.
 */
export async function validateTestedCheckout(deps: GitDeps, testedCommit: string): Promise<void> {
  const output = await execGitCommand(deps, ['git', 'rev-parse', '--verify', 'HEAD'], {
    all: false,
  });
  const head = output.trim();
  if (head.toLowerCase() !== testedCommit.toLowerCase()) {
    throw new TaskFailure(
      'Baseline workflows require a checkout of the exact tested commit. Check out that commit instead of a synthetic merge or a different CHROMATIC_SHA.',
      { exitCode: exitCodes.INVALID_OPTIONS, userError: true }
    );
  }
}
