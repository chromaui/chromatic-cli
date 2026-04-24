import { afterEach, describe, expect, it, vi } from 'vitest';

import * as execGit from '../../git/execGit';
import TestLogger from '../testLogger';
import { GitCommitInfo, GitRepository } from './git';
import { createInMemoryGitAdapter, InMemoryGitState } from './gitInMemoryAdapter';
import { createShellGitAdapter } from './gitShellAdapter';

vi.mock('../../git/execGit');
const execGitCommand = vi.mocked(execGit.execGitCommand);
const execGitCommandOneLine = vi.mocked(execGit.execGitCommandOneLine);
const execGitCommandCountLines = vi.mocked(execGit.execGitCommandCountLines);

const log = new TestLogger();

/**
 * A semantic primer over a GitRepository. Each method primes the underlying
 * adapter so that a subsequent call returns the described value. The shell
 * adapter is primed by configuring `execGit` mocks; the in-memory adapter is
 * primed by mutating its state.
 */
interface AdapterSetup {
  adapter: GitRepository;
  primeVersion: (version: string) => void;
  primeUserEmail: (email: string | undefined) => void;
  primeSlug: (origin: string, expected: string | undefined) => void;
  primeCommit: (revision: string | undefined, info: GitCommitInfo) => void;
  primeBranch: (branch: string) => void;
  primeUncommittedHash: (hash: string | undefined) => void;
  primeHasPreviousCommit: (hasParent: boolean) => void;
  primeCommitExists: (commit: string, exists: boolean) => void;
  primeChangedFiles: (base: string, head: string | undefined, files: string[]) => void;
  primeIsUpToDate: (upToDate: boolean) => void;
  primeIsClean: (clean: boolean) => void;
  primeUpdateMessage: (status: string, expected: string) => void;
  primeMergeBase: (head: string, base: string, mergeBase: string | undefined) => void;
  primeRepositoryRoot: (root: string) => void;
  primeFilesFromRoot: (root: string, patterns: string[], files: string[]) => void;
  primeRepositoryCreationDate: (date: Date) => void;
  primeStorybookCreationDate: (configDirectory: string, date: Date) => void;
  primeCommitterCount: (count: number) => void;
  primeCommittedFileCount: (names: string[], extensions: string[], count: number) => void;
  primeExecCommand: (command: string, result: string) => void;
}

function commitLine(info: GitCommitInfo): string {
  return `${info.commit} ## ${info.committedAt / 1000} ## ${info.committerEmail ?? ''} ## ${info.committerName ?? ''}`;
}

function shellSetup(): AdapterSetup {
  const adapter = createShellGitAdapter({ log });

  return {
    adapter,
    primeVersion: (version) =>
      execGitCommand.mockResolvedValueOnce(`git version ${version} (Apple Git-154)`),
    primeUserEmail: (email) => execGitCommand.mockResolvedValueOnce(email ?? ''),
    primeSlug: (origin) => execGitCommand.mockResolvedValueOnce(origin),
    primeCommit: (_revision, info) => execGitCommand.mockResolvedValueOnce(commitLine(info)),
    primeBranch: (branch) => execGitCommand.mockResolvedValueOnce(branch),
    primeUncommittedHash: (hash) => execGitCommand.mockResolvedValueOnce(hash ?? ''),
    primeHasPreviousCommit: (hasParent) =>
      execGitCommand.mockResolvedValueOnce(hasParent ? 'cafef00d\n' : ''),
    primeCommitExists: (_commit, exists) => {
      if (exists) {
        execGitCommand.mockResolvedValueOnce('');
      } else {
        execGitCommand.mockRejectedValueOnce(new Error('bad object'));
      }
    },
    primeChangedFiles: (_base, _head, files) =>
      execGitCommand.mockResolvedValueOnce(files.join('\n')),
    primeIsUpToDate: (upToDate) => {
      execGitCommand.mockResolvedValueOnce(''); // git remote update
      if (upToDate) {
        execGitCommand.mockResolvedValueOnce('abc');
        execGitCommand.mockResolvedValueOnce('abc');
      } else {
        execGitCommand.mockResolvedValueOnce('abc');
        execGitCommand.mockResolvedValueOnce('def');
      }
    },
    primeIsClean: (clean) => execGitCommand.mockResolvedValueOnce(clean ? '' : ' M file.ts'),
    primeUpdateMessage: (status) => execGitCommand.mockResolvedValueOnce(status),
    primeMergeBase: (_head, _base, mergeBase) =>
      execGitCommand.mockResolvedValueOnce(mergeBase ?? ''),
    primeRepositoryRoot: (root) => execGitCommand.mockResolvedValueOnce(root),
    primeFilesFromRoot: (_root, _patterns, files) =>
      execGitCommand.mockResolvedValueOnce(files.join('\0')),
    primeRepositoryCreationDate: (date) =>
      execGitCommandOneLine.mockResolvedValueOnce(date.toISOString()),
    primeStorybookCreationDate: (_configDirectory, date) =>
      execGitCommandOneLine.mockResolvedValueOnce(date.toISOString()),
    primeCommitterCount: (count) => execGitCommandCountLines.mockResolvedValueOnce(count),
    primeCommittedFileCount: (_names, _extensions, count) =>
      execGitCommandCountLines.mockResolvedValueOnce(count),
    primeExecCommand: (_command, result) => execGitCommand.mockResolvedValueOnce(result),
  };
}

function inMemorySetup(): AdapterSetup {
  const state: InMemoryGitState = { branch: 'main' };
  const adapter = createInMemoryGitAdapter(state);

  return {
    adapter,
    primeVersion: (version) => {
      state.version = version;
    },
    primeUserEmail: (email) => {
      state.userEmail = email;
    },
    primeSlug: (_origin, expected) => {
      state.slug = expected;
    },
    primeCommit: (revision, info) => {
      state.commits = { ...state.commits, [revision ?? '']: info };
    },
    primeBranch: (branch) => {
      state.branch = branch;
    },
    primeUncommittedHash: (hash) => {
      state.uncommittedHash = hash;
    },
    primeHasPreviousCommit: (hasParent) => {
      state.hasPreviousCommit = hasParent;
    },
    primeCommitExists: (commit, exists) => {
      state.existingCommits = new Set(state.existingCommits);
      if (exists) state.existingCommits.add(commit);
      else state.existingCommits.delete(commit);
    },
    primeChangedFiles: (base, head, files) => {
      state.changedFilesByRange = {
        ...state.changedFilesByRange,
        [`${base}..${head ?? ''}`]: files,
      };
    },
    primeIsUpToDate: (upToDate) => {
      state.isUpToDate = upToDate;
    },
    primeIsClean: (clean) => {
      state.isClean = clean;
    },
    primeUpdateMessage: (_status, expected) => {
      state.updateMessage = expected;
    },
    primeMergeBase: (head, base, mergeBase) => {
      state.mergeBases = { ...state.mergeBases, [`${head}..${base}`]: mergeBase };
    },
    primeRepositoryRoot: (root) => {
      state.repositoryRoot = root;
    },
    primeFilesFromRoot: (root, patterns, files) => {
      state.filesFromRoot = {
        ...state.filesFromRoot,
        [`${root}|${patterns.join(',')}`]: files,
      };
    },
    primeRepositoryCreationDate: (date) => {
      state.repositoryCreationDate = date;
    },
    primeStorybookCreationDate: (configDirectory, date) => {
      state.storybookCreationDates = { ...state.storybookCreationDates, [configDirectory]: date };
    },
    primeCommitterCount: (count) => {
      state.committerCount = count;
    },
    primeCommittedFileCount: (names, extensions, count) => {
      state.committedFileCounts = {
        ...state.committedFileCounts,
        [`${names.join(',')}|${extensions.join(',')}`]: count,
      };
    },
    primeExecCommand: (command, result) => {
      state.execResponses = { ...state.execResponses, [command]: result };
    },
  };
}

const adapters = [
  ['shell', shellSetup],
  ['in-memory', inMemorySetup],
] as const;

describe.each(adapters)('GitRepository (%s)', (_name, makeSetup) => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns version', async () => {
    const { adapter, primeVersion } = makeSetup();
    primeVersion('2.39.5');
    expect(await adapter.version()).toBe('2.39.5');
  });

  it('returns user email', async () => {
    const { adapter, primeUserEmail } = makeSetup();
    primeUserEmail('user@example.com');
    expect(await adapter.userEmail()).toBe('user@example.com');
  });

  it('returns slug from origin URL', async () => {
    const { adapter, primeSlug } = makeSetup();
    primeSlug('git@github.com:chromaui/chromatic-cli.git', 'chromaui/chromatic-cli');
    expect(await adapter.slug()).toBe('chromaui/chromatic-cli');
  });

  it('returns HEAD commit info', async () => {
    const { adapter, primeCommit } = makeSetup();
    const info: GitCommitInfo = {
      commit: '19b6c9c5b3d34d9fc55627fcaf8a85bd5d5e5b2a',
      committedAt: 1_696_588_814 * 1000,
      committerEmail: 'info@ghengeveld.nl',
      committerName: 'Gert Hengeveld',
    };
    primeCommit(undefined, info);
    expect(await adapter.commit()).toEqual(info);
  });

  it('returns current branch', async () => {
    const { adapter, primeBranch } = makeSetup();
    primeBranch('feature/new-thing');
    expect(await adapter.branch()).toBe('feature/new-thing');
  });

  it('returns uncommitted hash', async () => {
    const { adapter, primeUncommittedHash } = makeSetup();
    primeUncommittedHash('deadbeef');
    expect(await adapter.uncommittedHash()).toBe('deadbeef');
  });

  it('reports whether HEAD has a previous commit', async () => {
    const { adapter, primeHasPreviousCommit } = makeSetup();
    primeHasPreviousCommit(true);
    expect(await adapter.hasPreviousCommit()).toBe(true);
  });

  it('reports commit existence', async () => {
    const { adapter, primeCommitExists } = makeSetup();
    primeCommitExists('abc', true);
    expect(await adapter.commitExists('abc')).toBe(true);
  });

  it('reports absent commits', async () => {
    const { adapter, primeCommitExists } = makeSetup();
    primeCommitExists('missing', false);
    expect(await adapter.commitExists('missing')).toBe(false);
  });

  it('returns files changed between two commits', async () => {
    const { adapter, primeChangedFiles } = makeSetup();
    primeChangedFiles('abc', 'def', ['src/a.ts', 'src/b.ts']);
    expect(await adapter.changedFiles('abc', 'def')).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('reports up-to-date state', async () => {
    const { adapter, primeIsUpToDate } = makeSetup();
    primeIsUpToDate(true);
    expect(await adapter.isUpToDate()).toBe(true);
  });

  it('reports clean state', async () => {
    const { adapter, primeIsClean } = makeSetup();
    primeIsClean(true);
    expect(await adapter.isClean()).toBe(true);
  });

  it('returns the update message', async () => {
    const { adapter, primeUpdateMessage } = makeSetup();
    primeUpdateMessage('On branch main\nYour branch is behind', 'Your branch is behind');
    expect(await adapter.getUpdateMessage()).toBe('Your branch is behind');
  });

  it('returns a merge base between branches', async () => {
    const { adapter, primeMergeBase } = makeSetup();
    primeMergeBase('feature', 'main', 'abc');
    expect(await adapter.findMergeBase('feature', 'main')).toBe('abc');
  });

  it('returns the repository root', async () => {
    const { adapter, primeRepositoryRoot } = makeSetup();
    primeRepositoryRoot('/workspace/repo');
    expect(await adapter.repositoryRoot()).toBe('/workspace/repo');
  });

  it('returns files matching patterns from the repository root', async () => {
    const { adapter, primeFilesFromRoot } = makeSetup();
    primeFilesFromRoot('/repo', ['package.json'], ['/repo/package.json']);
    expect(await adapter.findFilesFromRepositoryRoot('/repo', 'package.json')).toEqual([
      '/repo/package.json',
    ]);
  });

  it('returns the repository creation date', async () => {
    const { adapter, primeRepositoryCreationDate } = makeSetup();
    const date = new Date('2020-01-01T00:00:00.000Z');
    primeRepositoryCreationDate(date);
    expect(await adapter.repositoryCreationDate()).toEqual(date);
  });

  it('returns the storybook creation date for a config dir', async () => {
    const { adapter, primeStorybookCreationDate } = makeSetup();
    const date = new Date('2021-06-01T00:00:00.000Z');
    primeStorybookCreationDate('.storybook', date);
    expect(await adapter.storybookCreationDate('.storybook')).toEqual(date);
  });

  it('returns committer count for the last 6 months', async () => {
    const { adapter, primeCommitterCount } = makeSetup();
    primeCommitterCount(7);
    expect(await adapter.committerCount()).toBe(7);
  });

  it('returns committed file count for name/extension pairs', async () => {
    const { adapter, primeCommittedFileCount } = makeSetup();
    primeCommittedFileCount(['router', 'route'], ['tsx', 'jsx'], 4);
    expect(await adapter.committedFileCount(['router', 'route'], ['tsx', 'jsx'])).toBe(4);
  });

  it('runs an arbitrary git command through the escape hatch', async () => {
    const { adapter, primeExecCommand } = makeSetup();
    primeExecCommand('git log --format=%H', 'abc\ndef\n');
    expect(await adapter.execCommand('git log --format=%H')).toBe('abc\ndef\n');
  });
});
