import { traceChangedFiles as traceChangedFilesDep } from '@cli/turbosnap';
import { access } from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../../lib/testLogger';
import { traceChangedFiles } from './traceChangedFiles';

vi.mock('fs');
vi.mock('@cli/turbosnap');
vi.mock('../readStatsFile', () => ({
  readStatsFile: () =>
    Promise.resolve({
      modules: [
        {
          id: '../__mocks__/storybookBaseDir/test.ts',
          name: '../__mocks__/storybookBaseDir/test.ts',
        },
      ],
    }),
}));

const traceChangedFilesTurbosnap = vi.mocked(traceChangedFilesDep);
const accessMock = vi.mocked(access);

const environment = { CHROMATIC_RETRIES: 2, CHROMATIC_OUTPUT_INTERVAL: 0 };
const log = new TestLogger();

const deps = () => ({ log, options: {}, report: vi.fn() }) as any;

const turboSnapContext = () =>
  ({
    env: environment,
    log,
    options: {},
    fileInfo: { statsPath: '/static/preview-stats.json' },
    git: { changedFiles: ['./example.js'] },
    turboSnap: {},
  }) as any;

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe('traceChangedFiles', () => {
  beforeEach(() => {
    accessMock.mockImplementation((_path, callback) => Promise.resolve(callback(null)));
  });

  it('returns onlyStoryFiles', async () => {
    const traced = { 123: ['./example.stories.js'] };
    traceChangedFilesTurbosnap.mockResolvedValue({
      status: 'traced',
      onlyStoryFiles: traced,
      turboSnap: {},
      untracedFiles: [],
    });

    const result = await traceChangedFiles(deps(), { turboSnapContext: turboSnapContext() });

    expect(result.onlyStoryFiles).toStrictEqual(Object.keys(traced));
  });

  it('escapes special characters', async () => {
    const traced = {
      './$example-new.stories.js': ['./$example-new.stories.js'],
      './+example-new.stories.js': ['./+example-new.stories.js'],
      './example-(new).stories.js': ['./example-(new).stories.js'],
      './example[[lang=language]].stories.js': ['./example[[lang=language]].stories.js'],
      '[./example/[account]/[id]/[unit]/language/example.stories.tsx]': [
        '[./example/[account]/[id]/[unit]/language/example.stories.tsx]',
      ],
    };
    traceChangedFilesTurbosnap.mockResolvedValue({
      status: 'traced',
      onlyStoryFiles: traced,
      turboSnap: {},
      untracedFiles: [],
    });

    const result = await traceChangedFiles(deps(), { turboSnapContext: turboSnapContext() });

    expect(result.onlyStoryFiles).toStrictEqual([
      String.raw`./\$example-new.stories.js`,
      String.raw`./\+example-new.stories.js`,
      String.raw`./example-\(new\).stories.js`,
      String.raw`./example\[\[lang=language\]\].stories.js`,
      String.raw`\[./example/\[account\]/\[id\]/\[unit\]/language/example.stories.tsx\]`,
    ]);
  });

  it('applies the trace result to the context', async () => {
    const ctx = turboSnapContext();
    traceChangedFilesTurbosnap.mockResolvedValue({
      status: 'traced',
      onlyStoryFiles: { 123: ['./example.stories.js'] },
      turboSnap: { rootPath: '/repo' },
      changedDependencyNames: ['moment'],
      untracedFiles: [{ filepath: './skipped.js', glob: '*.js' }],
    });

    await traceChangedFiles(deps(), { turboSnapContext: ctx });

    expect(ctx.turboSnap).toEqual({ rootPath: '/repo' });
    expect(ctx.git.changedDependencyNames).toEqual(['moment']);
    expect(ctx.untracedFiles).toEqual([{ filepath: './skipped.js', glob: '*.js' }]);
  });

  it('applies a bailed result to the context and reports the bail', async () => {
    const ctx = turboSnapContext();
    const d = deps();
    const turboSnap = { bailReason: { changedPackageFiles: ['./package.json'] } };
    traceChangedFilesTurbosnap.mockResolvedValue({ status: 'bailed', turboSnap });

    const result = await traceChangedFiles(d, { turboSnapContext: ctx });

    expect(result).toEqual({});
    expect(ctx.turboSnap).toEqual(turboSnap);
    expect(d.report).toHaveBeenCalledWith(expect.objectContaining({ title: 'TurboSnap disabled' }));
  });

  it('wraps the missing stats file error without recording a bail reason', async () => {
    const ctx = turboSnapContext();
    const missingStatsError = new Error('stats file not found');
    traceChangedFilesTurbosnap.mockRejectedValue(missingStatsError);

    let err;
    try {
      await traceChangedFiles(deps(), { turboSnapContext: ctx });
    } catch (error) {
      err = error;
    }

    expect(ctx.turboSnap.bailReason).toBeUndefined();
    expect(err.message).toBe('Could not retrieve dependent story files.\nstats file not found');
  });
});
