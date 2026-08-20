import * as Sentry from '@sentry/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readStatsFile } from '../../tasks/readStatsFile';
import { traceChangedFiles } from '.';
import { traceChangedFiles as traceChangedFilesV1 } from './v1';
import { traceChangedFiles as traceChangedFilesV2 } from './v2';
import { realProjectFiles } from './v2/projectFiles';

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
}));

vi.mock('../../tasks/readStatsFile', () => ({
  readStatsFile: vi.fn(),
}));

vi.mock('./v1', () => ({
  traceChangedFiles: vi.fn(),
}));

vi.mock('./v2', () => ({
  traceChangedFiles: vi.fn(),
}));

vi.mock('./v2/projectFiles', () => ({
  realProjectFiles: vi.fn(() => ({ kind: 'real-project-files' })),
}));

const stats = { modules: [] };
const v1Result = {
  status: 'traced' as const,
  onlyStoryFiles: { button: ['./src/Button.stories.tsx'] },
  turboSnap: {},
  untracedFiles: [],
};

function makeContext() {
  return {
    turboSnap: {},
    options: {},
    git: { changedFiles: ['./src/Button.tsx'] },
    fileInfo: { statsPath: '/repo/packages/ui/storybook-static/preview-stats.json' },
    client: { runQuery: vi.fn() },
    announcedBuild: { id: 'head-build' },
    sourceDir: '/repo/packages/ui/storybook-static',
    storybook: {
      projectRoot: '/repo/packages/ui',
      configDir: '/repo/packages/ui/.storybook',
      staticDirs: ['/repo/packages/ui/public'],
    },
  } as any;
}

beforeEach(() => {
  vi.mocked(readStatsFile).mockResolvedValue(stats);
  vi.mocked(traceChangedFilesV2).mockResolvedValue({ status: 'fallback' });
  vi.mocked(traceChangedFilesV1).mockResolvedValue(v1Result);
});

describe('traceChangedFiles', () => {
  it('returns skipped without running either generation when TurboSnap is unavailable', async () => {
    const ctx = {
      options: {},
      git: {},
      turboSnap: { unavailable: true },
    } as any;

    await expect(traceChangedFiles(ctx)).resolves.toStrictEqual({ status: 'skipped' });

    expect(readStatsFile).not.toHaveBeenCalled();
    expect(traceChangedFilesV2).not.toHaveBeenCalled();
    expect(traceChangedFilesV1).not.toHaveBeenCalled();
  });

  it('returns skipped without running either generation when there are no changed files', async () => {
    const ctx = {
      git: {},
      turboSnap: {},
    } as any;

    await expect(traceChangedFiles(ctx)).resolves.toStrictEqual({ status: 'skipped' });

    expect(readStatsFile).not.toHaveBeenCalled();
    expect(traceChangedFilesV2).not.toHaveBeenCalled();
    expect(traceChangedFilesV1).not.toHaveBeenCalled();
  });

  it('throws if the stats file is not found', async () => {
    const ctx = {
      options: {},
      sourceDir: '/static/',
      git: { changedFiles: ['./example.js'] },
      turboSnap: {},
    } as any;

    await expect(traceChangedFiles(ctx)).rejects.toThrow('TurboSnap requires a stats file');

    expect(readStatsFile).not.toHaveBeenCalled();
    expect(traceChangedFilesV2).not.toHaveBeenCalled();
    expect(traceChangedFilesV1).not.toHaveBeenCalled();
  });

  it('keeps an unreadable stats file terminal for both generations', async () => {
    const ctx = makeContext();
    const error = new Error('stats file is unreadable');
    vi.mocked(readStatsFile).mockRejectedValue(error);

    await expect(traceChangedFiles(ctx)).rejects.toBe(error);

    expect(readStatsFile).toHaveBeenCalledOnce();
    expect(traceChangedFilesV2).not.toHaveBeenCalled();
    expect(traceChangedFilesV1).not.toHaveBeenCalled();
  });

  it('reads the stats once and gives the same graph and Storybook paths to both generations', async () => {
    const ctx = makeContext();
    const projectFiles = realProjectFiles();
    vi.mocked(realProjectFiles).mockReturnValue(projectFiles as any);

    await traceChangedFiles(ctx);

    expect(readStatsFile).toHaveBeenCalledOnce();
    expect(readStatsFile).toHaveBeenCalledWith(ctx.fileInfo.statsPath);
    expect(traceChangedFilesV2).toHaveBeenCalledWith({
      graphqlClient: ctx.client,
      buildId: 'head-build',
      stats,
      manifestOutputDirectory: '/repo/packages/ui/storybook-static/.chromatic',
      projectRoot: ctx.storybook.projectRoot,
      configDir: ctx.storybook.configDir,
      staticDirs: ctx.storybook.staticDirs,
      projectFiles,
    });
    expect(traceChangedFilesV1).toHaveBeenCalledWith(ctx, stats, ctx.fileInfo.statsPath);
  });

  it('runs v2 before v1 and returns only the v1 result', async () => {
    const ctx = makeContext();

    await expect(traceChangedFiles(ctx)).resolves.toBe(v1Result);

    expect(vi.mocked(traceChangedFilesV2).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(traceChangedFilesV1).mock.invocationCallOrder[0]
    );
  });

  it('still runs v1 when v2 Bails', async () => {
    const ctx = makeContext();
    vi.mocked(traceChangedFilesV2).mockResolvedValue({ status: 'fallback' });

    await expect(traceChangedFiles(ctx)).resolves.toBe(v1Result);

    expect(traceChangedFilesV2).toHaveBeenCalledOnce();
    expect(traceChangedFilesV1).toHaveBeenCalledOnce();
  });

  it('reports an unexpected v2 rejection and still returns the v1 result', async () => {
    const ctx = makeContext();
    const error = new Error('v2 escaped its own error handling');
    vi.mocked(traceChangedFilesV2).mockRejectedValue(error);

    await expect(traceChangedFiles(ctx)).resolves.toBe(v1Result);

    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      fingerprint: ['TurboSnap v2', 'Failed to trace changed files'],
    });
    expect(traceChangedFilesV1).toHaveBeenCalledOnce();
  });

  it('does not report an exception when v2 succeeds', async () => {
    await traceChangedFiles(makeContext());

    expect(traceChangedFilesV2).toHaveBeenCalledOnce();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
