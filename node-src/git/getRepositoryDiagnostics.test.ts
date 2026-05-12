import { readFile } from 'fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../lib/testLogger';
import { execGitCommand } from './execGit';
import {
  enrichRepositoryDiagnostics,
  formatRepositoryDiagnostics,
  getRepositoryDiagnostics,
} from './getRepositoryDiagnostics';

vi.mock('./execGit');
vi.mock('fs/promises');

const execGitCommandMock = vi.mocked(execGitCommand);
const readFileMock = vi.mocked(readFile);

const log = new TestLogger();
const ctx = { log };

const mockGitResults = (results: Record<string, string | Error>) => {
  execGitCommandMock.mockImplementation((_, command) => {
    const result = results[command];
    if (result instanceof Error) return Promise.reject(result);
    if (result !== undefined) return Promise.resolve(result);
    return Promise.reject(new Error(`Unexpected command: ${command}`));
  });
};

beforeEach(() => {
  readFileMock.mockResolvedValue('');
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('getRepositoryDiagnostics', () => {
  it('collects cheap repository diagnostics without raw remote URL', async () => {
    vi.stubEnv('GIT_DEPTH', '1');
    mockGitResults({
      'git rev-parse --is-shallow-repository': 'true',
      'git rev-list --count HEAD': '1',
      'git rev-list --count --all': '2',
      'git rev-parse --is-bare-repository': 'false',
      'git rev-parse --abbrev-ref HEAD': 'HEAD',
      'git rev-parse --abbrev-ref --symbolic-full-name "@{upstream}"': 'origin/main',
      'git config --get remote.origin.url': 'git@github.com:chromaui/chromatic-cli.git',
      'git config --get extensions.partialclone': 'origin',
      'git config --get remote.origin.promisor': 'true',
      'git config --get remote.origin.partialclonefilter': 'blob:none',
      'git rev-parse --git-path shallow': '.git/shallow',
    });
    readFileMock.mockResolvedValue(
      Array.from({ length: 12 }, (_, index) => `commit${index}`).join('\n')
    );

    const diagnostics = await getRepositoryDiagnostics(ctx);

    expect(diagnostics).toMatchObject({
      version: 1,
      isShallowRepository: true,
      reachableCommitCountFromHead: 1,
      reachableCommitCountAllRefs: 2,
      isBareRepository: false,
      isDetachedHead: true,
      upstreamBranch: 'origin/main',
      remoteOrigin: { present: true, protocol: 'ssh', host: 'github.com' },
      partialClone: {
        promisorRemote: 'origin',
        remoteOriginPromisor: true,
        remoteOriginPartialCloneFilter: 'blob:none',
      },
      ciCheckoutEnvironment: { GIT_DEPTH: '1' },
      shallowBoundaryCount: 12,
    });
    expect(diagnostics.shallowBoundaryCommits).toHaveLength(10);
    expect(JSON.stringify(diagnostics)).not.toContain('chromaui/chromatic-cli.git');
  });

  it('captures probe errors without throwing', async () => {
    mockGitResults({
      'git rev-parse --is-shallow-repository': 'false',
      'git rev-list --count HEAD': new Error('timed out after 2000ms'),
      'git rev-list --count --all': '5',
      'git rev-parse --is-bare-repository': 'false',
      'git rev-parse --abbrev-ref HEAD': 'main',
      'git rev-parse --abbrev-ref --symbolic-full-name "@{upstream}"': new Error(
        'fatal: no upstream configured'
      ),
      'git config --get remote.origin.url': new Error('missing remote'),
      'git config --get extensions.partialclone': new Error('missing config'),
      'git config --get remote.origin.promisor': new Error('missing config'),
      'git config --get remote.origin.partialclonefilter': new Error('missing config'),
      'git rev-parse --git-path shallow': '.git/shallow',
    });
    readFileMock.mockRejectedValue(Object.assign(new Error('missing shallow'), { code: 'ENOENT' }));

    const diagnostics = await getRepositoryDiagnostics(ctx);

    expect(diagnostics).toMatchObject({
      isShallowRepository: false,
      reachableCommitCountAllRefs: 5,
      currentBranch: 'main',
      remoteOrigin: { present: false },
      shallowBoundaryCount: 0,
      shallowBoundaryCommits: [],
      probeErrors: {
        reachableCommitCountFromHead: 'timed out after 2000ms',
      },
    });
    expect(diagnostics.probeErrors).not.toHaveProperty('remoteOrigin');
    expect(diagnostics.probeErrors).not.toHaveProperty('upstreamBranch');
  });

  it('parses https remote origin host without storing the raw URL', async () => {
    mockGitResults({
      'git rev-parse --is-shallow-repository': 'false',
      'git rev-list --count HEAD': '3',
      'git rev-list --count --all': '3',
      'git rev-parse --is-bare-repository': 'false',
      'git rev-parse --abbrev-ref HEAD': 'main',
      'git rev-parse --abbrev-ref --symbolic-full-name "@{upstream}"': 'origin/main',
      'git config --get remote.origin.url': 'https://github.com/chromaui/chromatic-cli.git',
      'git config --get extensions.partialclone': new Error('missing config'),
      'git config --get remote.origin.promisor': new Error('missing config'),
      'git config --get remote.origin.partialclonefilter': new Error('missing config'),
      'git rev-parse --git-path shallow': '.git/shallow',
    });
    readFileMock.mockRejectedValue(Object.assign(new Error('missing shallow'), { code: 'ENOENT' }));

    const diagnostics = await getRepositoryDiagnostics(ctx);

    expect(diagnostics.remoteOrigin).toEqual({
      present: true,
      protocol: 'https',
      host: 'github.com',
    });
    expect(JSON.stringify(diagnostics)).not.toContain('chromaui/chromatic-cli.git');
  });

  it('omits empty host for file remote origin', async () => {
    mockGitResults({
      'git rev-parse --is-shallow-repository': 'true',
      'git rev-list --count HEAD': '1',
      'git rev-list --count --all': '1',
      'git rev-parse --is-bare-repository': 'false',
      'git rev-parse --abbrev-ref HEAD': 'main',
      'git rev-parse --abbrev-ref --symbolic-full-name "@{upstream}"': 'origin/main',
      'git config --get remote.origin.url': 'file:///Users/reuben/src/chromatic-cli',
      'git config --get extensions.partialclone': new Error('missing config'),
      'git config --get remote.origin.promisor': new Error('missing config'),
      'git config --get remote.origin.partialclonefilter': new Error('missing config'),
      'git rev-parse --git-path shallow': '.git/shallow',
    });
    readFileMock.mockRejectedValue(Object.assign(new Error('missing shallow'), { code: 'ENOENT' }));

    const diagnostics = await getRepositoryDiagnostics(ctx);

    expect(diagnostics.remoteOrigin).toEqual({
      present: true,
      protocol: 'file',
      host: undefined,
    });
    expect(JSON.stringify(diagnostics)).not.toContain('/Users/reuben/src/chromatic-cli');
  });
});

describe('enrichRepositoryDiagnostics', () => {
  it('adds role-labeled commit availability without mutating the input', async () => {
    mockGitResults({
      'git rev-parse "HEAD^"': 'abc123',
      'git cat-file -e "abc123^{commit}"': '',
      'git cat-file -e "def456^{commit}"': new Error('fatal: Not a valid object name def456'),
    });
    const diagnostics = { version: 1 as const, isShallowRepository: true };

    const enriched = await enrichRepositoryDiagnostics(ctx, diagnostics, {
      reason: 'invalid-changed-files',
      commits: [
        { role: 'head-parent', reference: 'HEAD^' },
        { role: 'baseline', commit: 'def456', buildNumber: 123 },
      ],
    });

    expect(diagnostics).not.toHaveProperty('commitAvailability');
    expect(enriched.commitAvailability).toEqual([
      {
        reason: 'invalid-changed-files',
        commits: [
          { role: 'head-parent', reference: 'HEAD^', commit: 'abc123', exists: true },
          {
            role: 'baseline',
            commit: 'def456',
            buildNumber: 123,
            exists: false,
            error: 'fatal: Not a valid object name def456',
          },
        ],
      },
    ]);
  });
});

describe('formatRepositoryDiagnostics', () => {
  it('formats a compact debug summary', () => {
    expect(
      formatRepositoryDiagnostics({
        version: 1,
        isShallowRepository: true,
        reachableCommitCountFromHead: 1,
        reachableCommitCountAllRefs: 3,
        partialClone: { remoteOriginPartialCloneFilter: 'blob:none' },
        isBareRepository: false,
        isDetachedHead: true,
      })
    ).toBe(
      'shallow=true, reachableFromHead=1, allRefs=3, partialCloneFilter=blob:none, bare=false, detached=true'
    );
  });
});
