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
    git: { changedFiles: ['./src/Button.tsx'], rootPath: overrides.rootPath },
    fileInfo: { statsPath: '/tmp/stats.json' },
    client: {},
    build: { id: '1' },
    sourceDir: '/repo/project',
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

  describe('projectRoot resolution', () => {
    beforeEach(() => {
      vi.mocked(traceChangedFilesV2).mockReset();
      vi.mocked(traceChangedFilesV2).mockResolvedValue({ status: 'skipped' });
      vi.mocked(traceChangedFilesV1).mockReset();
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
