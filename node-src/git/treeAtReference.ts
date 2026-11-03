import path from 'path';

import { execGitCommand, GitDeps } from './execGit';

// Tree entry mode git assigns to symbolic links, as printed by `git ls-tree`
// (regular files are 100644/100755, directories 040000, submodules 160000).
const SYMLINK_MODE = '120000';

/**
 * Check whether a path, such as a directory, is in the tree at the given reference.
 *
 * @param deps Function dependencies.
 * @param reference The reference (usually a commit or branch) to look at.
 * @param repositoryPath The repository-relative path to look for.
 *
 * @returns Whether the reference's tree has the path. Throws when the reference is missing.
 */
export async function pathExistsAtReference(
  deps: GitDeps,
  reference: string,
  repositoryPath: string
) {
  const entry = await execGitCommand(
    deps,
    `git ls-tree --full-tree ${reference} -- "${repositoryPath}"`,
    { all: false }
  );
  return entry.trim() !== '';
}

/**
 * Follow committed symlinks at the given reference until reaching a regular file. `git show` on a
 * symlink outputs the link target string rather than the linked file's contents, which is wrong
 * for e.g. a `pnpm-lock.yaml` symlinked to a shared lockfile elsewhere in a monorepo.
 *
 * @param deps Function dependencies.
 * @param reference The reference (usually a commit or branch) to resolve the path at.
 * @param fileName The repository-relative path to resolve.
 *
 * @returns The repository-relative path of the regular file the symlink chain points to, or
 * undefined when the path itself isn't at the reference.
 */
export async function resolveSymlinkAtReference(
  deps: GitDeps,
  reference: string,
  fileName: string
) {
  const visited = new Set<string>();
  let current = fileName;

  while (!visited.has(current)) {
    visited.add(current);
    const entry = await execGitCommand(
      deps,
      `git ls-tree --full-tree ${reference} -- "${current}"`,
      { all: false } // Only stdout, so a stderr warning can't hide a missing path.
    );
    // `ls-tree` prints nothing for a path the tree doesn't have, and fails for a missing reference.
    // A symlink whose target is missing is a broken file, not an added one.
    if (!entry.trim() && current === fileName) return undefined;
    if (!entry.startsWith(SYMLINK_MODE)) {
      return current;
    }

    const target = await execGitCommand(deps, `git show "${reference}:${current}"`);
    current = path.posix.join(path.posix.dirname(current), target.trim());
  }

  throw new Error(`Symbolic link cycle: ${reference}:${fileName}`);
}
