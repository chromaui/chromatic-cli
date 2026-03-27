import { beforeEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../lib/testLogger';
import { deepenFetchHistory, isShallowRepository } from './git';
import { GitHistoryRecoveryError, recoverMissingHistory } from './recoverMissingHistory';

vi.mock('./git', () => ({
  deepenFetchHistory: vi.fn(),
  isShallowRepository: vi.fn(),
}));

const mockIsShallowRepository = vi.mocked(isShallowRepository);
const mockDeepenFetchHistory = vi.mocked(deepenFetchHistory);

describe('recoverMissingHistory', () => {
  const log = new TestLogger();
  let ctx: any;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = { git: {}, log };
  });

  it('returns immediately when parent commits are already available', async () => {
    const getParentCommits = vi.fn().mockResolvedValue(['parent']);

    await expect(recoverMissingHistory(ctx, getParentCommits)).resolves.toEqual(['parent']);
    expect(getParentCommits).toHaveBeenCalledTimes(1);
    expect(mockIsShallowRepository).not.toHaveBeenCalled();
  });

  it('skips recovery for complete repositories', async () => {
    mockIsShallowRepository.mockResolvedValue(false);
    const getParentCommits = vi.fn().mockResolvedValue([]);

    await expect(recoverMissingHistory(ctx, getParentCommits)).resolves.toEqual([]);
    expect(ctx.git.historyRecovery).toEqual({
      status: 'skipped-not-shallow',
      attempts: [],
    });
    expect(mockDeepenFetchHistory).not.toHaveBeenCalled();
  });

  it('deepens history until parent commits are found', async () => {
    mockIsShallowRepository.mockResolvedValue(true);
    const getParentCommits = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['recovered-parent']);

    await expect(recoverMissingHistory(ctx, getParentCommits)).resolves.toEqual([
      'recovered-parent',
    ]);
    expect(mockDeepenFetchHistory).toHaveBeenCalledTimes(2);
    expect(mockDeepenFetchHistory).toHaveBeenNthCalledWith(1, ctx, 50);
    expect(mockDeepenFetchHistory).toHaveBeenNthCalledWith(2, ctx, 100);
    expect(ctx.git.historyRecovery).toEqual({
      status: 'recovered',
      attempts: [
        { deepenBy: 50, totalDepth: 50 },
        { deepenBy: 100, totalDepth: 150 },
      ],
    });
  });

  it('marks recovery as exhausted after the hard cap', async () => {
    mockIsShallowRepository.mockResolvedValue(true);
    const getParentCommits = vi.fn().mockResolvedValue([]);

    await expect(recoverMissingHistory(ctx, getParentCommits)).resolves.toEqual([]);
    expect(mockDeepenFetchHistory).toHaveBeenCalledTimes(8);
    expect(ctx.git.historyRecovery).toEqual({
      status: 'exhausted',
      attempts: [
        { deepenBy: 50, totalDepth: 50 },
        { deepenBy: 100, totalDepth: 150 },
        { deepenBy: 200, totalDepth: 350 },
        { deepenBy: 400, totalDepth: 750 },
        { deepenBy: 800, totalDepth: 1550 },
        { deepenBy: 1600, totalDepth: 3150 },
        { deepenBy: 3200, totalDepth: 6350 },
        { deepenBy: 50, totalDepth: 6400 },
      ],
    });
  });

  it('throws a recovery error when deepening fails', async () => {
    mockIsShallowRepository.mockResolvedValue(true);
    mockDeepenFetchHistory.mockRejectedValue(new Error('fatal: fetch failed'));
    const getParentCommits = vi.fn().mockResolvedValue([]);

    await expect(recoverMissingHistory(ctx, getParentCommits)).rejects.toThrow(
      GitHistoryRecoveryError
    );
    expect(ctx.git.historyRecovery).toEqual({
      status: 'failed',
      attempts: [{ deepenBy: 50, totalDepth: 50 }],
      failureMessage: 'fatal: fetch failed',
    });
  });
});
