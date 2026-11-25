import { afterEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../lib/testLogger';
import * as execGit from './execGit';
import { getChangedFilesWithStatus } from './getChangedFilesWithStatus';

vi.mock('./execGit');

const execGitCommand = vi.mocked(execGit.execGitCommand);

const ctx = { log: new TestLogger(), options: {} };

afterEach(() => {
  vi.clearAllMocks();
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
    expect(execGitCommand).toHaveBeenCalledWith(ctx, [
      'git',
      '--no-pager',
      'diff',
      '--name-status',
      '--no-relative',
      '--find-renames=20%',
      'abc123',
      'HEAD',
    ]);
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

  it('appends the pathspec when one is provided', async () => {
    execGitCommand.mockResolvedValue('');

    await getChangedFilesWithStatus(ctx, 'abc123', 'HEAD', ':(glob,top)**/pnpm-lock.yaml');

    expect(execGitCommand).toHaveBeenCalledWith(ctx, [
      'git',
      '--no-pager',
      'diff',
      '--name-status',
      '--no-relative',
      '--find-renames=20%',
      'abc123',
      'HEAD',
      '--',
      ':(glob,top)**/pnpm-lock.yaml',
    ]);
  });
});
