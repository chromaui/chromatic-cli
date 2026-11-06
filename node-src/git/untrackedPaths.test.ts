import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../lib/testLogger';
import * as execGit from './execGit';
import { getUntrackedPaths } from './untrackedPaths';

vi.mock('./execGit');

const execGitCommand = vi.mocked(execGit.execGitCommand);
const execGitCommandEntries = vi.mocked(execGit.execGitCommandEntries);

const ctx = { log: new TestLogger() };

afterEach(() => {
  vi.clearAllMocks();
});

describe('getUntrackedPaths', () => {
  // The index has at least one entry, so the untracked listing is trusted.
  beforeEach(() => {
    execGitCommandEntries.mockImplementationOnce(async function* () {
      yield 'src/Button.tsx';
    });
  });

  it('answers by absolute path, covering everything under a wholly untracked directory', async () => {
    // first call from getRepositoryRoot()
    execGitCommand.mockResolvedValueOnce('/root');
    execGitCommandEntries.mockImplementationOnce(async function* () {
      yield* ['generated/', 'debug.log', 'node_modules/'];
    });
    const untracked = await getUntrackedPaths(ctx);

    expect(untracked.has('/root/generated/schema.ts')).toBe(true);
    expect(untracked.has('/root/generated/deep/schema.ts')).toBe(true);
    expect(untracked.has('/root/debug.log')).toBe(true);
    expect(untracked.has('/root/node_modules/react/index.js')).toBe(true);

    expect(untracked.has('/root/src/Button.tsx')).toBe(false);
    expect(untracked.has('/root/generated-docs/index.md')).toBe(false);
    expect(untracked.has('/elsewhere/generated/schema.ts')).toBe(false);
  });

  it('reports nothing when git lists nothing', async () => {
    execGitCommand.mockResolvedValueOnce('/root');
    execGitCommandEntries.mockImplementationOnce(async function* () {
      yield* [];
    });

    const untracked = await getUntrackedPaths(ctx);

    expect(untracked.has('/root/src/Button.tsx')).toBe(false);
  });
});
