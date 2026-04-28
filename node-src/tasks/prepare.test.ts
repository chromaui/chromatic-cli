import { afterEach, describe, expect, it, vi } from 'vitest';

import * as phaseModule from '../run/phases/prepare';
import { PreparePhaseError } from '../run/phases/prepare';
import { runPrepare } from './prepare';

vi.mock('../run/phases/prepare', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../run/phases/prepare')>();
  return { ...actual, runPreparePhase: vi.fn() };
});

const runPreparePhase = vi.mocked(phaseModule.runPreparePhase);

afterEach(() => {
  vi.clearAllMocks();
});

function makeContext(overrides: Record<string, unknown> = {}): any {
  return {
    options: {},
    env: {},
    storybook: {},
    git: {},
    packageJson: {},
    sourceDir: '/static',
    ports: {},
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  };
}

const baseFileInfo = {
  paths: ['iframe.html', 'index.html'],
  statsPath: '',
  lengths: [
    { pathname: 'iframe.html', knownAs: 'iframe.html', contentLength: 42 },
    { pathname: 'index.html', knownAs: 'index.html', contentLength: 42 },
  ],
  total: 84,
};

const fakeTask = { title: '' } as any;

describe('runPrepare', () => {
  it('mirrors the prepared slice onto context on the happy path', async () => {
    runPreparePhase.mockResolvedValueOnce({
      sourceDir: '/var/storybook-static',
      fileInfo: baseFileInfo,
      outcome: { kind: 'prepared' },
    });
    const ctx = makeContext();
    await runPrepare(ctx, fakeTask);
    expect(ctx.sourceDir).toBe('/var/storybook-static');
    expect(ctx.fileInfo).toBe(baseFileInfo);
  });

  it('skips when ctx.skip is set', async () => {
    const ctx = makeContext({ skip: true });
    await runPrepare(ctx, fakeTask);
    expect(runPreparePhase).not.toHaveBeenCalled();
  });

  it('mirrors turboSnap and onlyStoryFiles when the trace succeeds', async () => {
    const turboSnap = { rootPath: '/repo' };
    runPreparePhase.mockResolvedValueOnce({
      sourceDir: '/static',
      fileInfo: baseFileInfo,
      onlyStoryFiles: ['./a.stories.js'],
      untracedFiles: ['./misc.txt'],
      turboSnap,
      outcome: { kind: 'turbosnap-traced', affectedStoryFiles: 1 },
    });
    const ctx = makeContext({ turboSnap: { rootPath: '/old' } });
    await runPrepare(ctx, fakeTask);
    expect(ctx.onlyStoryFiles).toEqual(['./a.stories.js']);
    expect(ctx.untracedFiles).toEqual(['./misc.txt']);
    expect(ctx.turboSnap).toBe(turboSnap);
  });

  it('mirrors a turbosnap bail outcome onto turboSnap.bailReason', async () => {
    runPreparePhase.mockResolvedValueOnce({
      sourceDir: '/static',
      fileInfo: baseFileInfo,
      turboSnap: { bailReason: { changedExternalFiles: ['vite.config.ts'] } },
      outcome: { kind: 'turbosnap-bailed' },
    });
    const ctx = makeContext({ turboSnap: {} });
    await runPrepare(ctx, fakeTask);
    expect(ctx.turboSnap?.bailReason).toEqual({ changedExternalFiles: ['vite.config.ts'] });
  });

  it('mirrors PreparePhaseError.turboSnap onto context before rethrowing', async () => {
    const error = new PreparePhaseError('Missing stats file', {
      category: 'missing-stats-file',
      turboSnap: { bailReason: { missingStatsFile: true } },
    });
    runPreparePhase.mockRejectedValueOnce(error);
    const ctx = makeContext({ turboSnap: {} });
    await expect(runPrepare(ctx, fakeTask)).rejects.toBe(error);
    expect(ctx.turboSnap?.bailReason).toEqual({ missingStatsFile: true });
  });

  it('rethrows non-PreparePhaseError unchanged', async () => {
    const original = new Error('weird');
    runPreparePhase.mockRejectedValueOnce(original);
    const ctx = makeContext();
    await expect(runPrepare(ctx, fakeTask)).rejects.toBe(original);
  });
});
