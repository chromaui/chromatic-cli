/** Shape of one commit as returned by {@link GitRepository.commit}. */
export interface GitCommitInfo {
  commit: string;
  committedAt: number;
  committerEmail: string | undefined;
  committerName: string | undefined;
}

/** Options for the raw escape-hatch {@link GitRepository.execCommand}. */
export interface ExecCommandOptions {
  timeout?: number;
}

/**
 * Semantic boundary over the git shell. Production callers use the shell
 * adapter; tests use the in-memory adapter.
 */
export interface GitRepository {
  /** Returns the git version string (e.g. `'2.39.5'`). */
  version(): Promise<string | undefined>;

  /** Returns the configured user email, or undefined when unset. */
  userEmail(): Promise<string | undefined>;

  /** Returns the `ownername/reponame` slug derived from origin remote URL. */
  slug(): Promise<string | undefined>;

  /**
   * Returns commit info for the given revision (defaults to HEAD).
   *
   * @param revision A git revision spec (commit SHA, branch, tag). Omit for HEAD.
   */
  commit(revision?: string): Promise<GitCommitInfo>;

  /** Returns the current branch name, or `'HEAD'` when detached. */
  branch(): Promise<string>;

  /** Returns a hash covering all uncommitted changes, or empty when clean. */
  uncommittedHash(): Promise<string | undefined>;

  /** Returns true when the current commit has a parent. */
  hasPreviousCommit(): Promise<boolean>;

  /** Returns true when the given SHA exists in the repository. */
  commitExists(commit: string): Promise<boolean>;

  /**
   * Returns files changed between two commits. An empty `headCommit` includes
   * uncommitted changes on top of `baseCommit`.
   */
  changedFiles(baseCommit: string, headCommit?: string): Promise<string[] | undefined>;

  /** Returns true when the workspace matches the upstream remote. */
  isUpToDate(): Promise<boolean>;

  /** Returns true when the workspace has no staged, unstaged, or untracked changes. */
  isClean(): Promise<boolean>;

  /** Returns the portion of `git status` describing remote divergence. */
  getUpdateMessage(): Promise<string | undefined>;

  /** Returns the best common ancestor commit of `head` and `base`. */
  findMergeBase(head: string, base: string): Promise<string | undefined>;

  /** Checks out the given reference. */
  checkout(reference: string): Promise<string | undefined>;

  /** Checks a single file out of `reference` into a temporary file. */
  checkoutFile(reference: string, fileName: string, tmpdir: string): Promise<string>;

  /** Checks out the previous branch (equivalent to `git checkout -`). */
  checkoutPrevious(): Promise<string | undefined>;

  /** Discards any pending changes (`git reset --hard`). */
  discardChanges(): Promise<string | undefined>;

  /** Returns the absolute path of the repository root. */
  repositoryRoot(): Promise<string | undefined>;

  /**
   * Returns repository-root-relative filenames matching the given patterns.
   *
   * @param repoRoot The absolute repository root path.
   * @param patterns Glob patterns, resolved against `repoRoot`.
   */
  findFilesFromRepositoryRoot(
    repoRoot: string,
    ...patterns: string[]
  ): Promise<string[] | undefined>;

  /** Returns the first-ever commit's date, or undefined when unavailable. */
  repositoryCreationDate(): Promise<Date | undefined>;

  /** Returns the first commit date that touched `configDirectory`, or undefined. */
  storybookCreationDate(configDirectory: string): Promise<Date | undefined>;

  /** Returns the number of unique committers in the last 6 months. */
  committerCount(): Promise<number | undefined>;

  /**
   * Returns the count of tracked files matching any of the name/extension pairs.
   * Names are matched with both leading-lowercase and leading-uppercase forms.
   *
   * @param nameMatches Substrings to match anywhere in the filename.
   * @param extensions Filename extensions, without the leading dot.
   */
  committedFileCount(nameMatches: string[], extensions: string[]): Promise<number | undefined>;

  /**
   * Escape hatch for git commands not covered by a semantic method. Used by
   * graph-walking code (parent commits, package-file diffs) that composes
   * multiple arbitrary git invocations. Prefer a semantic method when adding
   * new callers.
   *
   * @param command The full shell command.
   * @param options Execa-style options (timeout, etc.).
   */
  execCommand(command: string, options?: ExecCommandOptions): Promise<string | undefined>;
}
