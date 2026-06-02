import picomatch from 'picomatch';

/**
 * Checks whether a branch matches a glob pattern, or returns the boolean value directly.
 *
 * @param branch The git branch name to evaluate.
 * @param glob A glob pattern to match against, or a boolean flag to allow all branches.
 *
 * @returns Whether the branch matches the provided glob or the boolean flag is truthy.
 */
export default function matchesBranch(branch: string, glob: boolean | string) {
  return typeof glob === 'string' && glob.length > 0
    ? picomatch(glob, { bash: true })(branch)
    : !!glob;
}
