import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { execa } from 'execa';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../lib/testLogger';
import * as execGit from './execGit';
import { validateCleanCheckout, validateTestedCheckout } from './validateBaselineCheckout';
import { validateRequiredBaseline } from './validateRequiredBaseline';

const deps = { log: new TestLogger() };
const required = 'a'.repeat(40);
const tested = 'b'.repeat(40);

afterEach(() => vi.restoreAllMocks());

describe('required baseline validation failures', () => {
  beforeEach(() => {
    vi.spyOn(execGit, 'execGitCommand').mockResolvedValue('sha1');
  });

  it.each(['', 'HEAD', 'abc123', '--help', 'a'.repeat(40) + '; echo bad', 'a'.repeat(64)])(
    'rejects %s as a full SHA-1 commit ID before using it in a command',
    async (value) => {
      await expect(validateRequiredBaseline(deps, value, tested)).rejects.toThrow(
        'full sha1 commit ID'
      );
      expect(execGit.execGitCommand).toHaveBeenCalledTimes(1);
    }
  );

  it('rejects malformed tested commits', async () => {
    await expect(validateRequiredBaseline(deps, required, 'HEAD')).rejects.toThrow('tested commit');
    expect(execGit.execGitCommand).toHaveBeenCalledTimes(1);
  });

  it('rejects self-dependency, including uppercase input', async () => {
    await expect(validateRequiredBaseline(deps, required.toUpperCase(), required)).rejects.toThrow(
      'cannot depend on itself'
    );
  });

  it('rejects an unsupported object format', async () => {
    vi.mocked(execGit.execGitCommand).mockResolvedValue('unknown');
    await expect(validateRequiredBaseline(deps, required, tested)).rejects.toThrow(
      'unsupported Git object format'
    );
  });

  it('retains Git execution errors instead of reporting a non-ancestor', async () => {
    const failure = Object.assign(new Error('git failed'), { exitCode: 128 });
    vi.mocked(execGit.execGitCommand)
      .mockResolvedValueOnce('sha1')
      .mockResolvedValueOnce('commit')
      .mockResolvedValueOnce('commit')
      .mockRejectedValueOnce(failure);
    await expect(validateRequiredBaseline(deps, required, tested)).rejects.toMatchObject({
      message: expect.stringContaining('Git failed'),
      cause: failure,
    });
  });

  it('does not interpret a timeout as a non-ancestor', async () => {
    vi.mocked(execGit.execGitCommand)
      .mockResolvedValueOnce('sha1')
      .mockResolvedValueOnce('commit')
      .mockResolvedValueOnce('commit')
      .mockRejectedValueOnce(new Error('Command timed out'));
    await expect(validateRequiredBaseline(deps, required, tested)).rejects.toThrow('Git failed');
  });
});

describe.each(['sha1', 'sha256'])('required baseline in a real %s Git repository', (format) => {
  let directory: string;
  const executeGit = execGit.execGitCommand;
  const git = async (...args: string[]) => {
    const result = await execa('git', args, { cwd: directory });
    return result.stdout;
  };
  const commit = async (name: string) => {
    await git('commit', '--allow-empty', '-m', name);
    return git('rev-parse', 'HEAD');
  };

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'chromatic-required-baseline-'));
    await git('init', `--object-format=${format}`, '--initial-branch=main');
    await git('config', 'user.name', 'Chromatic Test');
    await git('config', 'user.email', 'test@example.com');
    await git('config', 'commit.gpgsign', 'false');
    vi.spyOn(execGit, 'execGitCommand').mockImplementation((commandDeps, command, options) =>
      executeGit(commandDeps, command, { ...options, cwd: directory })
    );
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('accepts X for P and Q but rejects the newer main commit Y', async () => {
    await commit('A');
    const x = await commit('X');
    const y = await commit('Y');
    await git('checkout', '-b', 'feature', x);
    const p = await commit('P');
    const q = await commit('Q');

    expect(await validateRequiredBaseline(deps, x.toUpperCase(), p)).toBe(x);
    expect(await validateRequiredBaseline(deps, x, q)).toBe(x);
    await expect(validateRequiredBaseline(deps, y, p)).rejects.toThrow('not an ancestor');
  });

  it('validates the tested commit instead of assuming the checkout is the feature head', async () => {
    const x = await commit('X');
    const p = await commit('P');
    await git('checkout', '--detach', x);
    expect(await validateRequiredBaseline(deps, x, p)).toBe(x);
  });

  it('requires checkout contents to match the commit being tested', async () => {
    const x = await commit('X');
    const p = await commit('P');
    await expect(validateTestedCheckout(deps, p)).resolves.toBeUndefined();
    await expect(validateTestedCheckout(deps, x)).rejects.toMatchObject({ exitCode: 254 });
  });

  it.each(['untracked', 'unstaged', 'staged', 'deleted'])(
    'rejects a checkout with %s input',
    async (change) => {
      const file = path.join(directory, 'input.txt');
      await writeFile(file, 'original');
      await git('add', 'input.txt');
      await commit('initial');
      await expect(validateCleanCheckout(deps)).resolves.toBeUndefined();
      await (change === 'deleted'
        ? rm(file)
        : writeFile(change === 'untracked' ? path.join(directory, 'new.txt') : file, 'changed'));
      if (change === 'staged') await git('add', 'input.txt');
      await expect(validateCleanCheckout(deps)).rejects.toMatchObject({ exitCode: 101 });
    }
  );

  it('rejects a tree object even though its ID is the correct length', async () => {
    const p = await commit('P');
    const tree = await git('rev-parse', 'HEAD^{tree}');
    await expect(validateRequiredBaseline(deps, tree, p)).rejects.toThrow(
      'tree object, not a commit'
    );
  });

  it('reports missing objects with fetch instructions', async () => {
    const p = await commit('P');
    const missing = 'f'.repeat(p.length);
    await expect(validateRequiredBaseline(deps, missing, p)).rejects.toThrow(
      'Fetch the required commit'
    );
  });

  it('reports truncated history when both commits exist but the ancestry path is missing', async () => {
    const x = await commit('X');
    await commit('intermediate');
    const p = await commit('P');
    const originDirectory = directory;
    const cloneDirectory = path.join(directory, 'shallow');
    await git('clone', '--depth=1', `file://${directory}`, cloneDirectory);
    directory = cloneDirectory;
    await git('fetch', '--depth=1', 'origin', x);

    try {
      await expect(validateRequiredBaseline(deps, x, p)).rejects.toThrow('git fetch --unshallow');
    } finally {
      directory = originDirectory;
    }
  });
});
