import { beforeEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../lib/testLogger';
import * as execGit from './execGit';
import { fetchCommit } from './fetchCommit';

vi.mock('./execGit');

const execGitCommand = vi.mocked(execGit.execGitCommand);
const execGitCommandOneLine = vi.mocked(execGit.execGitCommandOneLine);
const getGitTimeout = vi.mocked(execGit.getGitTimeout);

const commit = '19b6c9c5b3d34d9fc55627fcaf8a85bd5d5e5b2a';
const otherCommits = [commit.replace(/.$/, 'b'), commit.replace(/.$/, 'c')];

// A fetch that never finishes on its own, like one to a git host that drops traffic.
const hangUntilCanceled = async (
  _: unknown,
  __: string,
  options?: { cancelSignal?: AbortSignal }
) =>
  new Promise<string>((_resolve, reject) => {
    options?.cancelSignal?.addEventListener('abort', () =>
      reject(new Error('Command was canceled'))
    );
  });

describe('fetchCommit', () => {
  let ctx: { log: TestLogger; options: object };

  beforeEach(() => {
    ctx = { log: new TestLogger(), options: {} };
    getGitTimeout.mockReturnValue(20_000);
    execGitCommandOneLine.mockResolvedValue('false');
  });

  it.each([
    ['false', ''],
    ['true', ' --depth=1'],
  ])('fetches by hash (is-shallow: %s)', async (isShallow, depth) => {
    execGitCommandOneLine.mockResolvedValue(isShallow);
    execGitCommand.mockResolvedValue('');
    expect(await fetchCommit(ctx, commit)).toEqual(true);
    // A cancel signal stops git with SIGTERM, so it can remove its lock files; the `timeout`
    // option would SIGKILL it and leave `.git/shallow.lock` behind.
    expect(execGitCommand).toHaveBeenCalledWith(
      ctx,
      `git fetch --no-tags${depth} origin "${commit}"`,
      expect.anything()
    );
    // `toStrictEqual`, because without `timeout: undefined` execGitCommand applies its own timeout.
    expect(execGitCommand.mock.calls[0][2]).toStrictEqual({
      timeout: undefined,
      cancelSignal: expect.any(AbortSignal),
    });
  });

  it('caps the fetch at 5 seconds when the git timeout is longer', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    execGitCommand.mockResolvedValue('');
    await fetchCommit(ctx, commit);
    expect(timeout.mock.calls[0][0]).toBeGreaterThan(4900);
    expect(timeout.mock.calls[0][0]).toBeLessThanOrEqual(5000);
  });

  it('returns false if the fetch fails', async () => {
    execGitCommand.mockRejectedValueOnce(new Error('fatal: not our ref'));
    expect(await fetchCommit(ctx, commit)).toEqual(false);
    expect(ctx.log.info).not.toHaveBeenCalled();
  });

  it('does not run git for a value that is not a commit hash', async () => {
    expect(await fetchCommit(ctx, '"; rm -rf / #')).toEqual(false);
    expect(execGitCommand).not.toHaveBeenCalled();
  });

  it('runs one fetch at a time, so concurrent recoveries cannot clash over git locks', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    execGitCommand.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight -= 1;
      return '';
    });

    const commits = [commit, ...otherCommits];
    expect(await Promise.all(commits.map((sha) => fetchCommit(ctx, sha)))).toEqual([
      true,
      true,
      true,
    ]);
    expect(execGitCommand).toHaveBeenCalledTimes(3);
    expect(maxInFlight).toEqual(1);
  });

  it('gives fetches queued together one time budget, using a shorter git timeout', async () => {
    getGitTimeout.mockReturnValue(200);
    execGitCommand.mockImplementation(hangUntilCanceled);

    const start = Date.now();
    const first = fetchCommit(ctx, commit);
    // The other baselines' diffs fail later, while the first fetch is still running.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const rest = otherCommits.map((sha) => fetchCommit(ctx, sha));
    expect(await Promise.all([first, ...rest])).toEqual([false, false, false]);

    expect(Date.now() - start).toBeLessThan(400);
    expect(execGitCommand).toHaveBeenCalledTimes(1);
    expect(ctx.log.info).toHaveBeenCalledTimes(1);
    expect(ctx.log.info).toHaveBeenCalledWith(
      expect.stringContaining('CHROMATIC_TURBOSNAP_DISABLE_BASELINE_FETCH=true')
    );
  });

  it('gives a fetch that joins the batch late only the time left in it', async () => {
    getGitTimeout.mockReturnValue(400);
    execGitCommand.mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      throw new Error('fatal: not our ref');
    });
    execGitCommand.mockImplementation(hangUntilCanceled);

    const start = Date.now();
    const first = fetchCommit(ctx, commit);
    // Another baseline's diff fails while the first fetch is still running.
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(await Promise.all([first, fetchCommit(ctx, otherCommits[0])])).toEqual([false, false]);
    expect(Date.now() - start).toBeLessThan(550);
  });

  it('stops the batch once its fetch is canceled, even if the clock lags the timer', async () => {
    getGitTimeout.mockReturnValue(100);
    execGitCommand.mockImplementation(hangUntilCanceled);
    // The timer that cancels a fetch can fire before Date.now() reaches the deadline.
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now());
    expect(
      await Promise.all([fetchCommit(ctx, commit), fetchCommit(ctx, otherCommits[0])])
    ).toEqual([false, false]);
    now.mockRestore();
    expect(execGitCommand).toHaveBeenCalledTimes(1);
    expect(ctx.log.info).toHaveBeenCalledTimes(1);
  });

  it('starts a new time budget for a later batch of fetches', async () => {
    getGitTimeout.mockReturnValue(100);
    execGitCommand.mockImplementation(hangUntilCanceled);
    expect(await fetchCommit(ctx, commit)).toEqual(false);

    execGitCommand.mockResolvedValue('');
    expect(await fetchCommit(ctx, otherCommits[0])).toEqual(true);
  });
});
