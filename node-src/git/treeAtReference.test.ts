import { describe, expect, it, vi } from 'vitest';

import TestLogger from '../lib/testLogger';
import * as execGit from './execGit';
import { pathExistsAtReference } from './treeAtReference';

vi.mock('./execGit');

const execGitCommand = vi.mocked(execGit.execGitCommand);

const ctx = { log: new TestLogger(), options: {} };

describe('pathExistsAtReference', () => {
  it.each([
    ['040000 tree abc123\tpackages/ui', true],
    ['', false],
  ])('reads `git ls-tree` output %j as %s', async (output, expected) => {
    execGitCommand.mockResolvedValueOnce(output);

    await expect(pathExistsAtReference(ctx, 'abc123', 'packages/ui')).resolves.toBe(expected);
    expect(execGitCommand).toHaveBeenCalledWith(
      ctx,
      'git ls-tree --full-tree abc123 -- "packages/ui"',
      { all: false }
    );
  });
});
