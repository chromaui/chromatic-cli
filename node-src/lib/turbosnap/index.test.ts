import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { traceChangedFiles } from '.';
import { traceChangedFiles as traceChangedFilesV1 } from './v1';
import { traceChangedFiles as traceChangedFilesV2 } from './v2';

vi.mock('./v2', () => ({
  traceChangedFiles: vi.fn(),
}));

vi.mock('./v1', () => ({
  traceChangedFiles: vi.fn(),
}));

function makeContext(overrides: { rootPath?: string; baseDir?: string }) {
  return {
    turboSnap: {},
    options: {},
    git: { changedFiles: ['./src/Button.tsx'], rootPath: overrides.rootPath },
    fileInfo: { statsPath: '/tmp/stats.json' },
    client: {},
    build: { id: 'baseline-build' },
    announcedBuild: { id: 'head-build' },
    sourceDir: '/repo/project',
    log: { info: vi.fn(), error: vi.fn() },
    storybook: overrides.baseDir ? { baseDir: overrides.baseDir } : undefined,
  } as any;
}

describe('traceChangedFiles', () => {
  it('returns skipped when TurboSnap is unavailable', async () => {
    const ctx = {
      options: {},
      git: {},
      turboSnap: { unavailable: true },
    } as any;

    const result = await traceChangedFiles(ctx);

    expect(result).toStrictEqual({ status: 'skipped' });
  });

  it('returns skipped when there are no changed files from git', async () => {
    const ctx = {
      git: {},
      turboSnap: {},
    } as any;

    const result = await traceChangedFiles(ctx);

    expect(result).toStrictEqual({ status: 'skipped' });
  });

  it('runs neither algorithm when there are no changed files', async () => {
    const ctx = { git: {}, turboSnap: { bailReason: { noAncestorBuild: true as const } } } as any;

    await expect(traceChangedFiles(ctx)).resolves.toStrictEqual({ status: 'skipped' });
    expect(traceChangedFilesV1).not.toHaveBeenCalled();
    expect(traceChangedFilesV2).not.toHaveBeenCalled();
  });

  it('throws if stats file is not found', async () => {
    const packageMetadataChanges = [{ changedFiles: ['./package.json'], commit: 'abcdef' }];
    const ctx = {
      options: {},
      sourceDir: '/static/',
      git: { changedFiles: ['./example.js', './package.json'], packageMetadataChanges },
      turboSnap: {},
    } as any;

    let err;
    try {
      await traceChangedFiles(ctx);
    } catch (error) {
      err = error;
    }
    expect(err.message).toContain('TurboSnap requires a stats file');
    expect(ctx.turboSnap.bailReason).toBeUndefined();
  });

  it('does not let v1 replace a v2 stats read failure with a bail', async () => {
    const ctx = makeContext({ rootPath: '/repo' });
    const error = new Error('stats file is unreadable');
    vi.mocked(traceChangedFilesV2).mockRejectedValue(error);
    vi.mocked(traceChangedFilesV1).mockResolvedValue({
      status: 'bailed',
      turboSnap: { bailReason: { changedPackageFiles: ['./package.json'] } },
    });

    await expect(traceChangedFiles(ctx)).rejects.toBe(error);
    expect(traceChangedFilesV1).not.toHaveBeenCalled();
  });

  it('uploads hashes to the head build even when there is no baseline build', async () => {
    const ctx = makeContext({ rootPath: '/repo' });
    ctx.build = undefined;
    vi.mocked(traceChangedFilesV1).mockResolvedValue({ status: 'skipped' });
    vi.mocked(traceChangedFilesV2).mockResolvedValue({ status: 'fallback' });

    await traceChangedFiles(ctx);

    expect(traceChangedFilesV2).toHaveBeenCalledWith(
      expect.objectContaining({ buildId: 'head-build' })
    );
  });

  it('keeps v1 authoritative when v2 bails', async () => {
    const ctx = makeContext({ rootPath: '/repo' });
    const v1Result = {
      status: 'traced' as const,
      onlyStoryFiles: { button: ['./src/Button.stories.tsx'] },
      turboSnap: {},
      untracedFiles: [],
    };
    vi.mocked(traceChangedFilesV2).mockResolvedValue({
      status: 'bailed',
      turboSnap: { bailReason: { noStoryFiles: true } },
    });
    vi.mocked(traceChangedFilesV1).mockResolvedValue(v1Result);

    await expect(traceChangedFiles(ctx)).resolves.toBe(v1Result);
    expect(traceChangedFilesV1).toHaveBeenCalledWith(ctx);
  });

  it('still runs v2 for monitoring when v1 traces successfully', async () => {
    const ctx = makeContext({ rootPath: '/repo' });
    const v1Result = {
      status: 'traced' as const,
      onlyStoryFiles: { button: ['./src/Button.stories.tsx'] },
      turboSnap: {},
      untracedFiles: [],
    };
    vi.mocked(traceChangedFilesV2).mockResolvedValue({ status: 'fallback' });
    vi.mocked(traceChangedFilesV1).mockResolvedValue(v1Result);

    await expect(traceChangedFiles(ctx)).resolves.toBe(v1Result);
    expect(traceChangedFilesV2).toHaveBeenCalledOnce();
  });

  describe('projectRoot resolution', () => {
    beforeEach(() => {
      vi.mocked(traceChangedFilesV2).mockReset();
      vi.mocked(traceChangedFilesV2).mockResolvedValue({ status: 'skipped' });
      vi.mocked(traceChangedFilesV1).mockReset();
      vi.mocked(traceChangedFilesV1).mockResolvedValue({ status: 'skipped' });
    });

    it('resolves projectRoot from git.rootPath + storybook.baseDir', async () => {
      const ctx = makeContext({ rootPath: '/repo', baseDir: 'packages/ui' });

      await traceChangedFiles(ctx);

      expect(traceChangedFilesV2).toHaveBeenCalledWith(
        expect.objectContaining({ projectRoot: path.resolve('/repo', 'packages/ui') })
      );
    });

    it('resolves projectRoot to the repo root when storybook.baseDir is absent', async () => {
      const ctx = makeContext({ rootPath: '/repo' });

      await traceChangedFiles(ctx);

      expect(traceChangedFilesV2).toHaveBeenCalledWith(
        expect.objectContaining({ projectRoot: path.resolve('/repo', '.') })
      );
    });

    it('resolves projectRoot to process.cwd() when git.rootPath is absent', async () => {
      const ctx = makeContext({});

      await traceChangedFiles(ctx);

      expect(traceChangedFilesV2).toHaveBeenCalledWith(
        expect.objectContaining({ projectRoot: process.cwd() })
      );
    });
  });
});
