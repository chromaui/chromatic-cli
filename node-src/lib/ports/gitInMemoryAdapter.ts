import { GitCommitInfo, GitRepository } from './git';

/**
 * Fixture-driven state backing the in-memory {@link GitRepository} adapter.
 * Every field is optional apart from `branch` so callers provide only what a
 * given test exercises. Unset optional fields return `undefined`; lookup maps
 * return `undefined` for unknown keys.
 */
export interface InMemoryGitState {
  branch: string;

  version?: string;
  userEmail?: string;
  slug?: string;
  uncommittedHash?: string;
  repositoryRoot?: string;
  repositoryCreationDate?: Date;
  committerCount?: number;

  /** Keyed by revision spec. An empty-string key provides the HEAD commit. */
  commits?: Record<string, GitCommitInfo>;

  /** Whether HEAD has a parent commit. Defaults to true. */
  hasPreviousCommit?: boolean;

  /** Commits that exist in the repo (for {@link GitRepository.commitExists}). */
  existingCommits?: Set<string>;

  /** Keyed by `${baseCommit}..${headCommit ?? ''}`. */
  changedFilesByRange?: Record<string, string[]>;

  isUpToDate?: boolean;
  isClean?: boolean;
  updateMessage?: string;

  /** Keyed by `${head}..${base}`. */
  mergeBases?: Record<string, string | undefined>;

  storybookCreationDates?: Record<string, Date>;

  /** Keyed by `${repoRoot}|${patterns.join(',')}`. */
  filesFromRoot?: Record<string, string[]>;

  /**
   * Keyed by `${nameMatches.join(',')}|${extensions.join(',')}`. Defaults to
   * zero for unknown keys.
   */
  committedFileCounts?: Record<string, number>;

  /** Raw command responses for the {@link GitRepository.execCommand} escape. */
  execResponses?: Record<string, string>;
}

function rangeKey(a: string, b?: string): string {
  return `${a}..${b ?? ''}`;
}

/**
 * Construct a {@link GitRepository} backed by an in-memory fixture. The state
 * object is held by reference so tests can mutate it between calls.
 *
 * @param state The mutable fixture driving the adapter's responses.
 *
 * @returns A GitRepository that reads from the provided state object.
 */
export function createInMemoryGitAdapter(state: InMemoryGitState): GitRepository {
  return {
    async version() {
      return state.version;
    },
    async userEmail() {
      return state.userEmail;
    },
    async slug() {
      return state.slug;
    },
    async commit(revision = '') {
      const info = state.commits?.[revision];
      if (!info) {
        throw new Error(`No commit fixture for revision '${revision}'`);
      }
      return info;
    },
    async branch() {
      return state.branch;
    },
    async uncommittedHash() {
      return state.uncommittedHash;
    },
    async hasPreviousCommit() {
      return state.hasPreviousCommit ?? true;
    },
    async commitExists(commit) {
      return state.existingCommits?.has(commit) ?? false;
    },
    async changedFiles(baseCommit, headCommit) {
      return state.changedFilesByRange?.[rangeKey(baseCommit, headCommit)] ?? [];
    },
    async isUpToDate() {
      return state.isUpToDate ?? true;
    },
    async isClean() {
      return state.isClean ?? true;
    },
    async getUpdateMessage() {
      return state.updateMessage;
    },
    async findMergeBase(head, base) {
      return state.mergeBases?.[rangeKey(head, base)];
    },
    async checkout() {
      return undefined;
    },
    async checkoutFile(_reference, fileName) {
      return fileName;
    },
    async checkoutPrevious() {
      return undefined;
    },
    async discardChanges() {
      return undefined;
    },
    async repositoryRoot() {
      return state.repositoryRoot;
    },
    async findFilesFromRepositoryRoot(repoRoot, ...patterns) {
      return state.filesFromRoot?.[`${repoRoot}|${patterns.join(',')}`] ?? [];
    },
    async repositoryCreationDate() {
      return state.repositoryCreationDate;
    },
    async storybookCreationDate(configDirectory) {
      return state.storybookCreationDates?.[configDirectory];
    },
    async committerCount() {
      return state.committerCount;
    },
    async committedFileCount(nameMatches, extensions) {
      return state.committedFileCounts?.[`${nameMatches.join(',')}|${extensions.join(',')}`] ?? 0;
    },
    async execCommand(command) {
      return state.execResponses?.[command];
    },
  };
}
