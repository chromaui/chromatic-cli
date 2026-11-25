import { execGitCommand, GitDeps } from './execGit';

const newline = /\r\n|\r|\n/; // Git may return \n even on Windows, so we can't use EOL

/** The kind of change Git reported for a file in a `--name-status` diff. */
type ChangedFileStatus = 'added' | 'deleted' | 'modified' | 'renamed' | 'typeChanged' | 'unknown';

/** A single row of a `--name-status` diff, parsed into a usable shape. */
export interface ChangedFileWithStatus {
  /** The kind of change Git reported. */
  status: ChangedFileStatus;
  /** The file's current path (the new path for renames). */
  path: string;
  /** The original path for renames; otherwise undefined. */
  fromPath?: string;
}

// Maps the leading character of a `--name-status` row to a readable status. Renames carry a
// similarity score suffix (e.g. `R097`), so we only key off the first character.
const NAME_STATUS_CODES: Record<string, ChangedFileStatus> = {
  A: 'added',
  D: 'deleted',
  M: 'modified',
  R: 'renamed',
  T: 'typeChanged',
};

/**
 * Get the name-status diff of a single commit or between two, with rename detection, parsed into
 * one object per changed file.
 *
 * @param deps Function dependencies.
 * @param baseCommit The base commit to diff from.
 * @param headCommit The head commit to diff to (empty includes uncommitted changes).
 * @param pathspec Optional pathspec limiting the diff (e.g. a `:(glob)` magic pathspec).
 * See: https://git-scm.com/docs/gitglossary#Documentation/gitglossary.txt-pathspec for details on
 * magic pathspecs.
 *
 * @returns One entry per changed file.
 */
export async function getChangedFilesWithStatus(
  deps: GitDeps,
  baseCommit: string,
  headCommit = '',
  pathspec = ''
): Promise<ChangedFileWithStatus[]> {
  const pathspecArgument = pathspec ? ` -- "${pathspec}"` : '';
  const output = await execGitCommand(
    deps,
    `git --no-pager diff --name-status --no-relative --find-renames=20% ${baseCommit} ${headCommit}${pathspecArgument}`
  );

  return output
    .split(newline)
    .filter(Boolean)
    .map((line) => {
      const [code, ...paths] = line.split('\t');
      const status = NAME_STATUS_CODES[code[0]] ?? 'unknown';
      // Rename rows carry the old path first, then the new path.
      return status === 'renamed'
        ? { status, fromPath: paths[0], path: paths.at(-1) as string }
        : { status, path: paths[0] };
    });
}
