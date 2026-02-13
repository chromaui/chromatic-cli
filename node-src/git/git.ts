/* eslint-disable max-lines */
import { EOL } from 'os';
import pLimit from 'p-limit';
import path from 'path';
import { file as temporaryFile } from 'tmp-promise';

import { Context } from '../types';
import { execGitCommand, execGitCommandCountLines, execGitCommandOneLine } from './execGit';

const newline = /\r\n|\r|\n/; // Git may return \n even on Windows, so we can't use EOL
export const NULL_BYTE = '\0'; // Separator used when running `git ls-files` with `-z`

/**
 * Get the version of Git from the host.
 *
 * @param ctx Standard context object.
 *
 * @returns The Git version.
 */
export async function getVersion(ctx: Pick<Context, 'log'>) {
  const result = await execGitCommand(ctx, `git --version`);
  return result?.replace('git version ', '').replace(/\s*\(.*\)/, '');
}

/**
 * Get the user's email from Git.
 *
 * @param ctx Standard context object.
 *
 * @returns The user's email.
 */
export async function getUserEmail(ctx: Pick<Context, 'log'>) {
  return execGitCommand(ctx, `git config user.email`);
}

/**
 * The slug consists of the last two parts of the URL, at least for GitHub, GitLab and Bitbucket,
 * and is typically followed by `.git`. The regex matches the last two parts between slashes, and
 * ignores the `.git` suffix if it exists, so it matches something like `ownername/reponame`.
 *
 * @param ctx Standard context object.
 *
 * @returns The slug of the remote URL.
 */
export async function getSlug(ctx: Pick<Context, 'log'>) {
  const result = await execGitCommand(ctx, `git config --get remote.origin.url`);
  const downcasedResult = result?.toLowerCase() || '';
  const [, slug] = downcasedResult.match(/([^/:]+\/[^/]+?)(\.git)?$/) || [];
  return slug;
}

// NOTE: At some point we should check that the commit has been pushed to the
// remote and the branch matches with origin/REF, but for now we are naive about
// adhoc builds.

/**
 * Get commit details from Git.
 *
 * @param ctx Standard context object.
 * @param revision The argument to `git log` (usually a commit SHA).
 *
 * @returns Commit details from Git.
 */
export async function getCommit(ctx: Pick<Context, 'log'>, revision = '') {
  const result = await execGitCommand(
    ctx,
    // Technically this yields the author info, not committer info
    `git --no-pager log -n 1 --format="%H ## %ct ## %ae ## %an" ${revision}`
  );

  // Ignore lines that don't match the expected format (e.g. gpg signature info)
  const format = new RegExp('^[a-f0-9]+ ## ');
  const data = result?.split('\n').find((line: string) => format.test(line));

  const [commit, committedAtSeconds, committerEmail, committerName] = data?.split(' ## ') || [];
  const committedAt = Number(committedAtSeconds) * 1000;
  return { commit, committedAt, committerEmail, committerName };
}

/**
 * Get the current branch from Git.
 *
 * @param ctx Standard context object.
 *
 * @returns The branch name from Git.
 */
export async function getBranch(ctx: Pick<Context, 'log'>) {
  try {
    // Git v2.22 and above
    // Yields an empty string when in detached HEAD state
    const branch = await execGitCommand(ctx, 'git branch --show-current');
    return branch || 'HEAD';
  } catch {
    try {
      // Git v1.8 and above
      // Throws when in detached HEAD state
      const reference = await execGitCommand(ctx, 'git symbolic-ref HEAD');
      return reference?.replace(/^refs\/heads\//, ''); // strip the "refs/heads/" prefix
    } catch {
      // Git v1.7 and above
      // Yields 'HEAD' when in detached HEAD state
      const reference = await execGitCommand(ctx, 'git rev-parse --abbrev-ref HEAD');
      return reference?.replace(/^heads\//, ''); // strip the "heads/" prefix that's sometimes present
    }
  }
}

/**
 * Retrieve the hash of all uncommitted files, which includes staged, unstaged, and untracked files,
 * excluding deleted files (which can't be hashed) and ignored files. There is no one single Git
 * command to reliably get this information, so we use a combination of commands grouped together.
 *
 * @param ctx Standard context object.
 *
 * @returns The uncommited hash, if available.
 */
export async function getUncommittedHash(ctx: Pick<Context, 'log'>) {
  const listStagedFiles = 'git diff --name-only --no-relative --diff-filter=d --cached';
  const listUnstagedFiles = 'git diff --name-only --no-relative --diff-filter=d';
  const listUntrackedFiles = 'git ls-files --others --exclude-standard';
  const listUncommittedFiles = [listStagedFiles, listUnstagedFiles, listUntrackedFiles].join(';');

  const uncommittedHashWithPadding = await execGitCommand(
    ctx,
    // Pass the combined list of filenames to hash-object to retrieve a list of hashes. Then pass
    // the list of hashes to hash-object again to retrieve a single hash of all hashes. We use
    // stdin to avoid the limit on command line arguments.
    `(${listUncommittedFiles}) | git hash-object --stdin-paths | git hash-object --stdin`
  );
  const uncommittedHash = uncommittedHashWithPadding?.trim();

  // In case there are no uncommited changes (empty list), we always get this same hash.
  const noChangesHash = 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391';
  return uncommittedHash === noChangesHash ? '' : uncommittedHash;
}

/**
 * Determine if the current commit has at least one parent commit.
 *
 * @param ctx Standard context object.
 *
 * @returns True if the current commit has at least one parent.
 */
export async function hasPreviousCommit(ctx: Pick<Context, 'log'>) {
  const result = await execGitCommand(ctx, `git --no-pager log -n 1 --skip=1 --format="%H"`);

  // Ignore lines that don't match the expected format (e.g. gpg signature info)
  const allhex = new RegExp('^[a-f0-9]+$');
  return result?.split('\n').some((line: string) => allhex.test(line));
}

/**
 * Check if a commit exists in the repository
 *
 * @param ctx Standard context object.
 * @param commit The commit to check.
 *
 * @returns True if the commit exists.
 */
export async function commitExists(ctx: Pick<Context, 'log'>, commit: string) {
  try {
    await execGitCommand(ctx, `git cat-file -e "${commit}^{commit}"`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the changed files of a single commit or between two.
 *
 * @param ctx Standard context object.
 * @param baseCommit The base commit to check.
 * @param headCommit The head commit to check.
 *
 * @returns The list of changed files of a single commit or between two commits.
 */
export async function getChangedFiles(
  ctx: Pick<Context, 'log'>,
  baseCommit: string,
  headCommit = ''
) {
  // Note that an empty headCommit will include uncommitted (staged or unstaged) changes.
  const files = await execGitCommand(
    ctx,
    `git --no-pager diff --name-only --no-relative ${baseCommit} ${headCommit}`
  );
  return files?.split(newline).filter(Boolean);
}

/**
 * Returns a boolean indicating whether the workspace is up-to-date (neither ahead nor behind) with
 * the remote. Returns true on error, assuming the workspace is up-to-date.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns True if the workspace is up-to-date.
 */
export async function isUpToDate(ctx: Pick<Context, 'log'>) {
  const { log } = ctx;

  try {
    await execGitCommand(ctx, `git remote update`);
  } catch (err) {
    log.warn(err);
    return true;
  }

  let localCommit;
  try {
    localCommit = await execGitCommand(ctx, 'git rev-parse HEAD');
    if (!localCommit) throw new Error('Failed to retrieve last local commit hash');
  } catch (err) {
    log.warn(err);
    return true;
  }

  let remoteCommit;
  try {
    remoteCommit = await execGitCommand(ctx, 'git rev-parse "@{upstream}"');
    if (!remoteCommit) throw new Error('Failed to retrieve last remote commit hash');
  } catch (err) {
    log.warn(err);
    return true;
  }

  return localCommit === remoteCommit;
}

/**
 * Returns a boolean indicating whether the workspace is clean (no changes, no untracked files).
 *
 * @param ctx Standard context object.
 *
 * @returns True if the workspace has no changes.
 */
export async function isClean(ctx: Pick<Context, 'log'>) {
  const status = await execGitCommand(ctx, 'git status --porcelain');
  return status === '';
}

/**
 * Returns the "Your branch is behind by n commits (pull to update)" part of the git status message,
 * omitting any of the other stuff that may be in there. Note we expect the workspace to be clean.
 *
 * @param ctx Standard context object.
 *
 * @returns A message indicating how far behind the branch is from the remote.
 */
export async function getUpdateMessage(ctx: Pick<Context, 'log'>) {
  const status = await execGitCommand(ctx, 'git status');
  return status
    ?.split(/(\r\n|\r|\n){2}/)[0] // drop the 'nothing to commit' part
    .split(newline)
    .filter((line) => !line.startsWith('On branch')) // drop the 'On branch x' part
    .join(EOL)
    .trim();
}

/**
 * Returns the git merge base between two branches, which is the best common ancestor between the
 * last commit on either branch. The "best" is defined by not having any descendants which are a
 * common ancestor themselves. Consider this example:
 *
 *   - A - M  <= main
 *      \ /
 *       B    <= develop
 *        \
 *         C  <= feature
 *
 * The merge base between main and feature is B, because it's the best common ancestor of C and M.
 * A is a common ancestor too, but it isn't the "best" one because it's an ancestor of B.
 *
 * It's also possible to have a situation with two merge bases, where there isn't one "best" option:
 *
 *   - A - M  <= main
 *      \ /
 *       x    (not a commit)
 *      / \
 *   - B - N  <= develop
 *
 * Here, both A and B are the best common ancestor between main and develop. Neither one is the
 * single "best" option because they aren't ancestors of each other. In this case we try to pick the
 * one on the base branch, but if that fails we just pick the first one and hope it works out.
 * Luckily this is an uncommon scenario.
 *
 * @param ctx Standard context object.
 * @param headReference Name of the head branch
 * @param baseReference Name of the base branch
 *
 * @returns The best common ancestor commit between the two provided.
 */
export async function findMergeBase(
  ctx: Pick<Context, 'log'>,
  headReference: string,
  baseReference: string
) {
  const result = await execGitCommand(
    ctx,
    `git merge-base --all ${headReference} ${baseReference}`
  );
  const mergeBases =
    result?.split(newline).filter((line) => line && !line.startsWith('warning: ')) || [];
  if (mergeBases.length === 0) return undefined;
  if (mergeBases.length === 1) return mergeBases[0];

  // If we find multiple merge bases, look for one on the base branch.
  // If we don't find a merge base on the base branch, just return the first one.
  const branchNames = await Promise.all(
    mergeBases.map(async (sha) => {
      const name = await execGitCommand(
        ctx,
        `git name-rev --name-only --no-relative --exclude="tags/*" ${sha}`
      );
      return name?.replace(/~\d+$/, ''); // Drop the potential suffix
    })
  );
  const baseReferenceIndex = branchNames.indexOf(baseReference);
  return mergeBases[baseReferenceIndex] || mergeBases[0];
}

/**
 *
 * @param ctx Standard context object.
 * @param reference The reference to checkout (usually a commit).
 *
 * @returns The result of the Git checkout call in the terminal.
 */
export async function checkout(ctx: Pick<Context, 'log'>, reference: string) {
  return execGitCommand(ctx, `git checkout ${reference}`);
}

const limitConcurrency = pLimit(10);

/**
 * Checkout a file at the given reference and write the results to a temporary file.
 *
 * @param ctx The context set when executing the CLI.
 * @param ctx.log The logger found on the context object.
 * @param reference The reference (usually a commit or branch) to the file version in Git.
 * @param fileName The name of the file to check out.
 * @param tmpdir The directory to write the temporary file to.
 *
 * @returns The temporary file path of the checked out file.
 */
export async function checkoutFile(
  ctx: Pick<Context, 'log'>,
  reference: string,
  fileName: string,
  tmpdir: string
) {
  const pathspec = `${reference}:${fileName}`;

  return limitConcurrency(async () => {
    const { path: targetFileName } = await temporaryFile({
      name: path.basename(fileName),
      tmpdir,
    });

    ctx.log.debug(`Checking out file ${pathspec} at ${targetFileName}`);
    await execGitCommand(ctx, `git show ${pathspec} > ${targetFileName}`);

    return targetFileName;
  });
}

/**
 * Check out the previous branch in the Git repository.
 *
 * @param ctx Standard context object.
 *
 * @returns The result of the `git checkout` command in the terminal.
 */
export async function checkoutPrevious(ctx: Pick<Context, 'log'>) {
  return execGitCommand(ctx, `git checkout -`);
}

/**
 * Reset any pending changes in the Git repository.
 *
 * @param ctx Standard context object.
 *
 * @returns The result of the `git reset` command in the terminal.
 */
export async function discardChanges(ctx: Pick<Context, 'log'>) {
  return execGitCommand(ctx, `git reset --hard`);
}

/**
 * Gather the root directory of the Git repository.
 *
 * @param ctx Standard context object.
 *
 * @returns The root directory of the Git repository.
 */
export async function getRepositoryRoot(ctx: Pick<Context, 'log'>) {
  return execGitCommand(ctx, `git rev-parse --show-toplevel`);
}

/**
 * Find all files that match the given patterns within the repository.
 *
 * @param ctx Standard context object.
 * @param repoRoot The root path of the repository (usually from getRepositoryRoot()).
 * @param patterns A list of patterns to filter file results.
 *
 * @returns A list of files matching the pattern.
 */
export async function findFilesFromRepositoryRoot(
  ctx: Pick<Context, 'log'>,
  repoRoot: string,
  ...patterns: string[]
) {
  // Ensure patterns are referenced from the repository root so that running
  // from within a subdirectory does not skip the directories above
  // e.g. /root/package.json, /root/**/package.json
  // Note that this does not use `path.join` to concatenate the file paths because
  // git uses forward slashes, even on windows
  const patternsFromRoot = patterns.map((pattern) => `${repoRoot}/${pattern}`);

  // Uses `--full-name` to ensure that all files found are relative to the repository root,
  // not the directory in which this is executed from
  const gitCommand = `git ls-files --full-name -z ${patternsFromRoot.map((p) => `"${p}"`).join(' ')}`;
  const files = await execGitCommand(ctx, gitCommand);
  return files?.split(NULL_BYTE).filter(Boolean);
}

/**
 * Determine if the branch is from a GitHub merge queue.
 *
 * @param _ctx Standard context object.
 * @param branch The branch name in question.
 *
 * @returns The pull request number associated for the branch.
 */
export async function mergeQueueBranchMatch(_ctx: Pick<Context, 'log'>, branch: string) {
  const mergeQueuePattern = new RegExp(/gh-readonly-queue\/.*\/pr-(\d+)-[\da-f]{30}/);
  const match = branch.match(mergeQueuePattern);

  return match ? Number(match[1]) : undefined;
}

/**
 * Determine the date the repository was created
 *
 * @param ctx Standard context object.
 *
 * @returns Date The date the repository was created
 */
export async function getRepositoryCreationDate(ctx: Pick<Context, 'log'>) {
  try {
    const dateString = await execGitCommandOneLine(
      ctx,
      `git log --reverse --format=%cd --date=iso`,
      {
        timeout: 5000,
      }
    );

    return new Date(dateString);
  } catch {
    return undefined;
  }
}

/**
 * Determine the date the storybook was added to the repository
 *
 * @param ctx Context The context set when executing the CLI.
 * @param ctx.options Object standard context options
 * @param ctx.options.storybookConfigDir Configured Storybook config dir, if set
 *
 * @returns Date The date the storybook was added
 */
export async function getStorybookCreationDate(
  ctx: Pick<Context, 'log'> & {
    options: {
      storybookConfigDir?: Context['options']['storybookConfigDir'];
    };
  }
) {
  try {
    const configDirectory = ctx.options.storybookConfigDir ?? '.storybook';
    const dateString = await execGitCommandOneLine(
      ctx,
      `git log --follow --reverse --format=%cd --date=iso -- ${configDirectory}`,
      { timeout: 5000 }
    );
    return new Date(dateString);
  } catch {
    return undefined;
  }
}

/**
 * Determine the number of committers in the last 6 months
 *
 * @param ctx Standard context object.
 *
 * @returns number The number of committers
 */
export async function getNumberOfComitters(ctx: Pick<Context, 'log'>) {
  try {
    return await execGitCommandCountLines(ctx, `git shortlog -sn --all --since="6 months ago"`, {
      timeout: 5000,
    });
  } catch {
    return undefined;
  }
}

/**
 * Find the number of files in the git index that include a name with the given prefixes.
 *
 * @param ctx Standard context object.
 * @param nameMatches The names to match - will be matched with upper and lowercase first letter
 * @param extensions The filetypes to match
 *
 * @returns The number of files matching the above
 */
export async function getCommittedFileCount(
  ctx: Pick<Context, 'log'>,
  nameMatches: string[],
  extensions: string[]
) {
  try {
    const bothCasesNameMatches = nameMatches.flatMap((match) => [
      match,
      [match[0].toUpperCase(), ...match.slice(1)].join(''),
    ]);

    const globs = bothCasesNameMatches.flatMap((match) =>
      extensions.map((extension) => `"*${match}*.${extension}"`)
    );

    return await execGitCommandCountLines(ctx, `git ls-files -- ${globs.join(' ')}`, {
      timeout: 5000,
    });
  } catch {
    return undefined;
  }
}
