/**
 * Reject a value from outside the CLI, such as a branch name, that git would read as an option
 * (`--output=<file>`) rather than a revision. `--end-of-options` would do the same, but needs git
 * 2.24.
 *
 * @param revision The revision to check.
 */
export function assertNotOption(revision: string) {
  if (revision.startsWith('-')) {
    throw new Error(`Invalid revision '${revision}'`);
  }
}

/**
 * Whether a value is a commit SHA, full or abbreviated. Commits read back from the index are only
 * passed to git when they are.
 *
 * @param commit The value to check.
 *
 * @returns True if the value is a hexadecimal SHA.
 */
export function isCommitSha(commit: string) {
  return /^[\da-f]+$/i.test(commit);
}
