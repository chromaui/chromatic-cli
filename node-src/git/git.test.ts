import { afterEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../lib/testLogger';
import {
  AncestorMissingError,
  BaselineCheckoutFailedError,
  GitCommandError,
} from '../lib/turbosnap/v1/errors';
import * as execGit from './execGit';
import {
  checkoutFile,
  commitExists,
  findFilesFromRepositoryRoot,
  getBranch,
  getChangedFiles,
  getChangedFilesWithStatus,
  getCloneDepth,
  getCloneFilter,
  getCommit,
  getCommittedFileCount,
  getNumberOfCommitters,
  getRepositoryCreationDate,
  getShallowBoundaryCommits,
  getSlug,
  getStorybookCreationDate,
  getUncommittedHash,
  getUserEmail,
  getVersion,
  getVisitedCommitDetails,
  hasPreviousCommit,
  NULL_BYTE,
} from './git';

vi.mock('./execGit');
vi.mock('fs/promises', () => ({ readFile: vi.fn() }));
vi.mock('tmp-promise', () => ({
  file: vi.fn().mockResolvedValue({ path: '/tmp/fake-target' }),
}));

const execGitCommand = vi.mocked(execGit.execGitCommand);
const execGitCommandOneLine = vi.mocked(execGit.execGitCommandOneLine);
const execGitCommandCountLines = vi.mocked(execGit.execGitCommandCountLines);

const { readFile } = vi.mocked(await import('fs/promises'));

const ctx = { log: new TestLogger() };

afterEach(() => {
  vi.clearAllMocks();
});

describe('getVersion', () => {
  it('returns the Git version', async () => {
    execGitCommand.mockResolvedValue('git version 2.39.5 (Apple Git-154)');
    expect(await getVersion(ctx)).toEqual('2.39.5');
  });
});

describe('getUserEmail', () => {
  it('returns the user email', async () => {
    execGitCommand.mockResolvedValue('support@chromatic.com');
    expect(await getUserEmail(ctx)).toEqual('support@chromatic.com');
  });
});

describe('getCommit', () => {
  it('parses log output', async () => {
    execGitCommand.mockResolvedValue(
      `19b6c9c5b3d34d9fc55627fcaf8a85bd5d5e5b2a ## 1696588814 ## info@ghengeveld.nl ## Gert Hengeveld`
    );
    expect(await getCommit(ctx)).toEqual({
      commit: '19b6c9c5b3d34d9fc55627fcaf8a85bd5d5e5b2a',
      committedAt: 1_696_588_814 * 1000,
      committerEmail: 'info@ghengeveld.nl',
      committerName: 'Gert Hengeveld',
    });
  });

  it('ignores gpg signature information', async () => {
    execGitCommand.mockResolvedValue(
      `gpg: Signature made Fri Oct  6 12:40:14 2023 CEST
gpg:                using RSA key 4AEE18F83AFDEB23
gpg: Can't check signature: No public key
19b6c9c5b3d34d9fc55627fcaf8a85bd5d5e5b2a ## 1696588814 ## info@ghengeveld.nl ## Gert Hengeveld`.trim()
    );
    expect(await getCommit(ctx)).toEqual({
      commit: '19b6c9c5b3d34d9fc55627fcaf8a85bd5d5e5b2a',
      committedAt: 1_696_588_814 * 1000,
      committerEmail: 'info@ghengeveld.nl',
      committerName: 'Gert Hengeveld',
    });
  });
});

describe('getBranch', () => {
  it('returns the branch name', async () => {
    execGitCommand.mockResolvedValue('main');
    expect(await getBranch(ctx)).toEqual('main');
  });

  it('returns HEAD if the branch is not found', async () => {
    execGitCommand.mockResolvedValue('');
    expect(await getBranch(ctx)).toEqual('HEAD');
  });

  it('supports Git before v2.22', async () => {
    execGitCommand.mockRejectedValueOnce(new Error(`git: 'branch' is not a git command`));
    execGitCommand.mockResolvedValue('refs/heads/main');
    expect(await getBranch(ctx)).toEqual('main');
  });

  it('supports Git v1.7', async () => {
    execGitCommand.mockRejectedValueOnce(new Error(`git: 'branch' is not a git command`));
    execGitCommand.mockRejectedValueOnce(new Error(`git: 'symbolic-ref' is not a git command`));
    execGitCommand.mockResolvedValue('heads/main');
    expect(await getBranch(ctx)).toEqual('main');
  });
});

describe('getUncommittedHash', () => {
  it('returns the uncommitted hash', async () => {
    execGitCommand.mockResolvedValue('1234567890');
    expect(await getUncommittedHash(ctx)).toEqual('1234567890');
  });
});

describe('getSlug', () => {
  it('returns the slug portion of the git url', async () => {
    execGitCommand.mockResolvedValue('git@github.com:chromaui/chromatic-cli.git');
    expect(await getSlug(ctx)).toBe('chromaui/chromatic-cli');

    execGitCommand.mockResolvedValue('https://github.com/chromaui/chromatic-cli');
    expect(await getSlug(ctx)).toBe('chromaui/chromatic-cli');

    execGitCommand.mockResolvedValue('https://gitlab.com/foo/bar.baz.git');
    expect(await getSlug(ctx)).toBe('foo/bar.baz');
  });
});

describe('hasPreviousCommit', () => {
  it('returns true if a commit is found', async () => {
    execGitCommand.mockResolvedValue(`19b6c9c5b3d34d9fc55627fcaf8a85bd5d5e5b2a`);
    expect(await hasPreviousCommit(ctx)).toEqual(true);
  });

  it('returns false if no commit is found', async () => {
    execGitCommand.mockResolvedValue(``);
    expect(await hasPreviousCommit(ctx)).toEqual(false);
  });

  it('ignores gpg signature information', async () => {
    execGitCommand.mockResolvedValue(
      `
gpg: Signature made Fri Oct  6 12:40:14 2023 CEST
gpg:                using RSA key 4AEE18F83AFDEB23
gpg: Can't check signature: No public key
19b6c9c5b3d34d9fc55627fcaf8a85bd5d5e5b2a`.trim()
    );
    expect(await hasPreviousCommit(ctx)).toEqual(true);
  });
});

describe('commitExists', () => {
  it('returns true if the commit exists', async () => {
    execGitCommand.mockResolvedValue('');
    expect(await commitExists(ctx, '1234567890')).toEqual(true);
  });

  it('returns false if the commit does not exist', async () => {
    execGitCommand.mockRejectedValueOnce(
      new Error(`fatal: Not a valid object name 1234567890^{commit}`)
    );
    expect(await commitExists(ctx, '1234567890')).toEqual(false);
  });
});

describe('getChangedFiles', () => {
  it('returns the parsed list of changed files on success', async () => {
    execGitCommand.mockResolvedValue('a.ts\nb.ts\n');
    expect(await getChangedFiles(ctx, 'abc123')).toEqual(['a.ts', 'b.ts']);
  });

  it('throws AncestorMissingError when execGitCommand rejects with "bad object"', async () => {
    const cause = new Error('fatal: bad object abc123');
    execGitCommand.mockRejectedValueOnce(cause);

    let err;
    try {
      await getChangedFiles(ctx, 'abc123');
    } catch (error) {
      err = error;
    }

    expect(err).toBeInstanceOf(AncestorMissingError);
    expect(err).toMatchObject({ commit: 'abc123', cause });
  });

  it('throws GitCommandError for any other execGitCommand rejection', async () => {
    const cause = new Error('fatal: git is broken');
    execGitCommand.mockRejectedValueOnce(cause);

    let err;
    try {
      await getChangedFiles(ctx, 'abc123');
    } catch (error) {
      err = error;
    }

    expect(err).toBeInstanceOf(GitCommandError);
    expect(err).toMatchObject({ cause });
  });
});

describe('getChangedFilesWithStatus', () => {
  it('parses single-path rows (added, modified, deleted) into status objects', async () => {
    execGitCommand.mockResolvedValue(
      ['A\tpackage.json', 'M\tsrc/index.ts', 'D\told.ts'].join('\n')
    );

    const result = await getChangedFilesWithStatus(ctx, 'abc123', 'HEAD');

    expect(result).toEqual([
      { status: 'added', path: 'package.json' },
      { status: 'modified', path: 'src/index.ts' },
      { status: 'deleted', path: 'old.ts' },
    ]);
    expect(execGitCommand).toHaveBeenCalledWith(
      ctx,
      'git --no-pager diff --name-status --no-relative --find-renames=20% abc123 HEAD'
    );
  });

  it('parses a rename row into a renamed status carrying both paths', async () => {
    execGitCommand.mockResolvedValue('R097\tlibs/old/package.json\tlibs/app/package.json\n');

    const result = await getChangedFilesWithStatus(ctx, 'abc123', 'HEAD');

    expect(result).toEqual([
      { status: 'renamed', fromPath: 'libs/old/package.json', path: 'libs/app/package.json' },
    ]);
  });

  it('maps an unrecognized status code to unknown', async () => {
    execGitCommand.mockResolvedValue('X\tweird.txt\n');

    const result = await getChangedFilesWithStatus(ctx, 'abc123', 'HEAD');

    expect(result).toEqual([{ status: 'unknown', path: 'weird.txt' }]);
  });

  it('returns an empty array when there are no changes', async () => {
    execGitCommand.mockResolvedValue('');

    const result = await getChangedFilesWithStatus(ctx, 'abc123', 'HEAD');

    expect(result).toEqual([]);
  });

  it('appends a quoted pathspec when one is provided', async () => {
    execGitCommand.mockResolvedValue('');

    await getChangedFilesWithStatus(ctx, 'abc123', 'HEAD', ':(glob,top)**/pnpm-lock.yaml');

    expect(execGitCommand).toHaveBeenCalledWith(
      ctx,
      'git --no-pager diff --name-status --no-relative --find-renames=20% abc123 HEAD -- ":(glob,top)**/pnpm-lock.yaml"'
    );
  });
});

describe('findFilesFromRepositoryRoot', () => {
  it('finds files relative to the repository root', async () => {
    const filesFound = ['package.json', 'another/package/package.json'];

    // first call from getRepositoryRoot()
    execGitCommand.mockResolvedValueOnce(filesFound.join(NULL_BYTE));

    const results = await findFilesFromRepositoryRoot(
      ctx,
      '/root',
      'package.json',
      '**/package.json'
    );

    expect(execGitCommand).toBeCalledTimes(1);
    expect(execGitCommand).toHaveBeenNthCalledWith(
      1,
      ctx,
      'git ls-files --full-name -z "/root/package.json" "/root/**/package.json"'
    );
    expect(results).toEqual(filesFound);
  });
});

describe('checkoutFile', () => {
  it('wraps a failing `git show` in BaselineCheckoutFailedError with cause', async () => {
    const cause = new Error('git show failed');
    execGitCommand.mockRejectedValueOnce(cause);

    let err;
    try {
      await checkoutFile(ctx, 'abc123', 'package.json', '/tmp/anywhere');
    } catch (error) {
      err = error;
    }

    expect(err).toBeInstanceOf(BaselineCheckoutFailedError);
    expect(err).toMatchObject({ cause });
  });
});

describe('getRepositoryCreationDate', () => {
  it('parses the date successfully', async () => {
    execGitCommandOneLine.mockResolvedValue(`2017-05-17 10:00:35 -0700`);
    expect(await getRepositoryCreationDate(ctx)).toEqual(new Date('2017-05-17T17:00:35.000Z'));
  });
});

describe('getStorybookCreationDate', () => {
  it('passes the config dir to the git command', async () => {
    const ctxWithConfig = {
      ...ctx,
      options: { storybookConfigDir: 'special-config-dir' },
    };
    await getStorybookCreationDate(ctxWithConfig);
    expect(execGitCommandOneLine).toHaveBeenCalledWith(
      ctxWithConfig,
      expect.stringMatching(/special-config-dir/),
      expect.anything()
    );
  });

  it('defaults the config dir to the git command', async () => {
    await getStorybookCreationDate({ ...ctx, options: {} });
    expect(execGitCommandOneLine).toHaveBeenCalledWith(
      { ...ctx, options: {} },
      expect.stringMatching(/.storybook/),
      expect.anything()
    );
  });

  it('parses the date successfully', async () => {
    execGitCommandOneLine.mockResolvedValue(`2017-05-17 10:00:35 -0700`);
    expect(
      await getStorybookCreationDate({ ...ctx, options: { storybookConfigDir: '.storybook' } })
    ).toEqual(new Date('2017-05-17T17:00:35.000Z'));
  });
});

describe('getNumberOfComitters', () => {
  it('parses the count successfully', async () => {
    execGitCommandCountLines.mockResolvedValue(17);
    expect(await getNumberOfCommitters(ctx)).toEqual(17);
  });
});

describe('getCommittedFileCount', () => {
  it('constructs the correct command', async () => {
    await getCommittedFileCount(ctx, ['page', 'screen'], ['js', 'ts']);
    expect(execGitCommandCountLines).toHaveBeenCalledWith(
      ctx,
      'git ls-files -- "*page*.js" "*page*.ts" "*Page*.js" "*Page*.ts" "*screen*.js" "*screen*.ts" "*Screen*.js" "*Screen*.ts"',
      expect.anything()
    );
  });
  it('parses the count successfully', async () => {
    execGitCommandCountLines.mockResolvedValue(17);
    expect(await getCommittedFileCount(ctx, ['page', 'screen'], ['js', 'ts'])).toEqual(17);
  });
});

describe('getCloneDepth', () => {
  it('returns shallow when git reports true', async () => {
    execGitCommandOneLine.mockResolvedValue('true');
    expect(await getCloneDepth(ctx)).toBe('shallow');
  });

  it('returns full when git reports false', async () => {
    execGitCommandOneLine.mockResolvedValue('false');
    expect(await getCloneDepth(ctx)).toBe('full');
  });
});

describe('getShallowBoundaryCommits', () => {
  it('returns the boundary commits listed in the shallow file', async () => {
    execGitCommandOneLine.mockResolvedValue('/path/to/.git/shallow');
    readFile.mockResolvedValue('abc1234\ndef5678\n');
    expect(await getShallowBoundaryCommits(ctx)).toEqual(['abc1234', 'def5678']);
  });

  it('returns an empty array when the shallow file does not exist', async () => {
    execGitCommandOneLine.mockResolvedValue('/path/to/.git/shallow');
    readFile.mockRejectedValue(new Error('ENOENT'));
    expect(await getShallowBoundaryCommits(ctx)).toEqual([]);
  });

  it('returns an empty array for an empty shallow file', async () => {
    execGitCommandOneLine.mockResolvedValue('/path/to/.git/shallow');
    readFile.mockResolvedValue('');
    expect(await getShallowBoundaryCommits(ctx)).toEqual([]);
  });
});

describe('getCloneFilter', () => {
  it('returns blobless when the filter is blob:none', async () => {
    execGitCommandOneLine.mockResolvedValue('blob:none');
    expect(await getCloneFilter(ctx)).toBe('blobless');
  });

  it('returns treeless when the filter is tree:0', async () => {
    execGitCommandOneLine.mockResolvedValue('tree:0');
    expect(await getCloneFilter(ctx)).toBe('treeless');
  });

  it('returns full when no filter is configured (git config exits non-zero)', async () => {
    execGitCommandOneLine.mockRejectedValue(new Error('exit code 1'));
    expect(await getCloneFilter(ctx)).toBe('full');
  });
});

describe('getVisitedCommitDetails', () => {
  it('returns an empty array when given no commits', async () => {
    expect(await getVisitedCommitDetails(ctx, [])).toEqual([]);
    expect(execGitCommand).not.toHaveBeenCalled();
  });

  it('parses commit SHA, parent SHAs, and marks non-squash subject', async () => {
    execGitCommand.mockResolvedValue('abc123\0def456 ghi789\0Regular commit message\0');
    expect(await getVisitedCommitDetails(ctx, ['abc123'])).toEqual([
      { commit: 'abc123', parentCommits: ['def456', 'ghi789'], isProbableSquashMerge: false },
    ]);
  });

  it('sets isProbableSquashMerge true when subject contains (#N)', async () => {
    execGitCommand.mockResolvedValue('abc123\0def456\0Merge my feature (#42)\0');
    const [result] = await getVisitedCommitDetails(ctx, ['abc123']);
    expect(result.isProbableSquashMerge).toBe(true);
  });

  it('sets isProbableSquashMerge false for a regular merge commit subject', async () => {
    execGitCommand.mockResolvedValue(
      'abc123\0def456 ghi789\0Merge pull request #42 from org/branch\0'
    );
    const [result] = await getVisitedCommitDetails(ctx, ['abc123']);
    expect(result.isProbableSquashMerge).toBe(false);
  });

  it('returns an empty parentCommits array for a root commit', async () => {
    execGitCommand.mockResolvedValue('abc123\0\0Initial commit\0');
    expect(await getVisitedCommitDetails(ctx, ['abc123'])).toEqual([
      { commit: 'abc123', parentCommits: [], isProbableSquashMerge: false },
    ]);
  });

  it('parses multiple commits', async () => {
    execGitCommand.mockResolvedValue(
      'aaa111\0bbb222\0Fix bug (#10)\0\nccc333\0ddd444\0Regular commit\0'
    );
    const results = await getVisitedCommitDetails(ctx, ['aaa111', 'ccc333']);
    expect(results).toEqual([
      { commit: 'aaa111', parentCommits: ['bbb222'], isProbableSquashMerge: true },
      { commit: 'ccc333', parentCommits: ['ddd444'], isProbableSquashMerge: false },
    ]);
  });

  it('returns an empty array when git returns no output', async () => {
    execGitCommand.mockResolvedValue('');
    expect(await getVisitedCommitDetails(ctx, ['abc123'])).toEqual([]);
  });
});
