import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readStatsFile } from '../../tasks/readStatsFile';
import { traceChangedFiles } from '.';
import { readStorybookDirectories } from './storybookDirectories';
import { traceChangedFiles as traceChangedFilesV1 } from './v1';
import { traceChangedFiles as traceChangedFilesV2 } from './v2';

vi.mock('../../tasks/readStatsFile', () => ({
  readStatsFile: vi.fn(),
}));

vi.mock('./storybookDirectories', () => ({
  readStorybookDirectories: vi.fn(),
}));

vi.mock('./v2', () => ({
  traceChangedFiles: vi.fn(),
}));

vi.mock('./v1', () => ({
  traceChangedFiles: vi.fn(),
}));

const stats = { modules: [] };

function makeContext(overrides: { rootPath?: string; baseDir?: string } = {}) {
  const rootPath = 'rootPath' in overrides ? overrides.rootPath : '/repo';

  return {
    turboSnap: {},
    options: {},
    git: { changedFiles: ['./src/Button.tsx'], rootPath },
    fileInfo: { statsPath: '/tmp/stats.json' },
    client: {},
    build: { id: 'baseline-build' },
    announcedBuild: { id: 'head-build' },
    sourceDir: '/repo/project',
    log: { info: vi.fn(), error: vi.fn() },
    storybook: overrides.baseDir ? { baseDir: overrides.baseDir } : undefined,
  } as any;
}

beforeEach(() => {
  vi.mocked(readStatsFile).mockResolvedValue(stats);
  vi.mocked(readStorybookDirectories).mockResolvedValue({
    configDir: '.storybook',
    staticDirs: [],
  });
});

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
    const ctx = {
      git: {},
      turboSnap: { bailReason: { noAncestorBuild: true } },
    } as any;

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

  it('reads the stats file once and shares it with both algorithms', async () => {
    const ctx = makeContext();
    vi.mocked(traceChangedFilesV2).mockResolvedValue({ status: 'fallback' });
    vi.mocked(traceChangedFilesV1).mockResolvedValue({ status: 'skipped' });

    await traceChangedFiles(ctx);

    expect(readStatsFile).toHaveBeenCalledOnce();
    expect(traceChangedFilesV2).toHaveBeenCalledWith(expect.objectContaining({ stats }));
    expect(traceChangedFilesV1).toHaveBeenCalledWith(ctx, stats, '/tmp/stats.json');
  });

  it('preserves the terminal unreadable stats behavior', async () => {
    const ctx = makeContext();
    const error = new Error('stats file is unreadable');
    vi.mocked(readStatsFile).mockRejectedValue(error);

    let err;
    try {
      await traceChangedFiles(ctx);
    } catch (error_) {
      err = error_;
    }
    expect(err).toBe(error);
    expect(traceChangedFilesV2).not.toHaveBeenCalled();
    expect(traceChangedFilesV1).not.toHaveBeenCalled();
  });

  it('still runs v1 when v2 rejects', async () => {
    const ctx = makeContext();
    const v1Result = {
      status: 'traced' as const,
      onlyStoryFiles: { button: ['./src/Button.stories.tsx'] },
      turboSnap: {},
      untracedFiles: [],
    };
    vi.mocked(traceChangedFilesV2).mockRejectedValue(new Error('stats file is unreadable'));
    vi.mocked(traceChangedFilesV1).mockResolvedValue(v1Result);

    await expect(traceChangedFiles(ctx)).resolves.toBe(v1Result);
    expect(traceChangedFilesV1).toHaveBeenCalledWith(ctx, stats, '/tmp/stats.json');
  });

  it('uploads hashes to the head build even when there is no baseline build', async () => {
    const ctx = makeContext();
    ctx.build = undefined;
    vi.mocked(traceChangedFilesV1).mockResolvedValue({ status: 'skipped' });
    vi.mocked(traceChangedFilesV2).mockResolvedValue({ status: 'fallback' });

    await traceChangedFiles(ctx);

    expect(traceChangedFilesV2).toHaveBeenCalledWith(
      expect.objectContaining({ buildId: 'head-build' })
    );
  });

  it('keeps v1 authoritative when v2 bails', async () => {
    const ctx = makeContext();
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
    expect(traceChangedFilesV1).toHaveBeenCalledWith(ctx, stats, '/tmp/stats.json');
  });

  it('still runs v2 for monitoring when v1 traces successfully', async () => {
    const ctx = makeContext();
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

  // v1 reads `ctx.storybook.configDir` and `ctx.storybook.staticDir`, so v2 taking its directories
  // from anywhere else is what keeps v2 from changing what v1 traces.
  it('derives the Storybook directories from the project rather than from ctx.storybook', async () => {
    const ctx = makeContext();
    ctx.options = { storybookConfigDir: 'config', buildScriptName: 'storybook:ci' };
    ctx.storybook = { configDir: 'from-metadata', staticDir: ['from-metadata/public'] };
    vi.mocked(readStorybookDirectories).mockResolvedValue({
      configDir: 'config',
      staticDirs: ['config/public'],
    });
    vi.mocked(traceChangedFilesV1).mockResolvedValue({ status: 'skipped' });
    vi.mocked(traceChangedFilesV2).mockResolvedValue({ status: 'fallback' });

    await traceChangedFiles(ctx);

    expect(readStorybookDirectories).toHaveBeenCalledWith(
      expect.objectContaining({
        projectRoot: '/repo',
        configDir: 'config',
        buildScriptName: 'storybook:ci',
      })
    );
    expect(traceChangedFilesV2).toHaveBeenCalledWith(
      expect.objectContaining({ configDir: 'config', staticDirs: ['config/public'] })
    );
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
        expect.objectContaining({ projectRoot: '/repo/packages/ui' })
      );
    });

    it('resolves projectRoot to the repo root when storybook.baseDir is absent', async () => {
      const ctx = makeContext();

      await traceChangedFiles(ctx);

      expect(traceChangedFilesV2).toHaveBeenCalledWith(
        expect.objectContaining({ projectRoot: '/repo' })
      );
    });

    it('resolves projectRoot to process.cwd() when git.rootPath is absent', async () => {
      const ctx = makeContext({ rootPath: undefined });

      await traceChangedFiles(ctx);

      expect(traceChangedFilesV2).toHaveBeenCalledWith(
        expect.objectContaining({ projectRoot: process.cwd() })
      );
    });
  });
});
