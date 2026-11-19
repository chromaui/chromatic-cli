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

const deps = () => ({ log, env: environment, options: {}, report: vi.fn() }) as any;
const dryRunDeps = () => ({ ...deps(), options: { dryRun: true, interactive: true } });

const input = () =>
  ({
    buildId: 'build-id',
    sourceDir: '/static',
    statsPath: '/static/preview-stats.json',
    git: { changedFiles: ['./example.js'] },
    storybook: {},
    turboSnap: {},
  }) as any;

const v1Traced = { mechanism: 'v1', bailed: false } as const;
const v1Bailed = { mechanism: 'v1', bailed: true } as const;

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
      outcome: v1Traced,
    });

    const result = await traceChangedFiles(deps(), input());

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
      outcome: v1Traced,
    });

    const result = await traceChangedFiles(deps(), input());

    expect(result.onlyStoryFiles).toStrictEqual([
      String.raw`./\$example-new.stories.js`,
      String.raw`./\+example-new.stories.js`,
      String.raw`./example-\(new\).stories.js`,
      String.raw`./example\[\[lang=language\]\].stories.js`,
      String.raw`\[./example/\[account\]/\[id\]/\[unit\]/language/example.stories.tsx\]`,
    ]);
  });

  it('returns the trace result', async () => {
    traceChangedFilesTurbosnap.mockResolvedValue({
      status: 'traced',
      onlyStoryFiles: { 123: ['./example.stories.js'] },
      turboSnap: { rootPath: '/repo' },
      changedDependencyNames: ['moment'],
      untracedFiles: [{ filepath: './skipped.js', glob: '*.js' }],
      outcome: v1Traced,
    });

    const result = await traceChangedFiles(deps(), input());

    expect(result).toStrictEqual({
      turboSnapOutcome: v1Traced,
      turboSnap: { rootPath: '/repo' },
      onlyStoryFiles: ['123'],
      changedDependencyNames: ['moment'],
      untracedFiles: [{ filepath: './skipped.js', glob: '*.js' }],
    });
  });

  it('returns a bailed result and reports the bail', async () => {
    const d = deps();
    const turboSnap = { bailReason: { changedPackageFiles: ['./package.json'] } };
    traceChangedFilesTurbosnap.mockResolvedValue({
      status: 'bailed',
      turboSnap,
      outcome: v1Bailed,
    });

    const result = await traceChangedFiles(d, input());

    expect(result).toStrictEqual({ turboSnapOutcome: v1Bailed, turboSnap });
    expect(d.report).toHaveBeenCalledWith(expect.objectContaining({ title: 'TurboSnap disabled' }));
  });

  it('wraps the missing stats file error', async () => {
    const missingStatsError = new Error('stats file not found');
    traceChangedFilesTurbosnap.mockRejectedValue(missingStatsError);

    let err;
    try {
      await traceChangedFiles(deps(), input());
    } catch (error) {
      err = error;
    }

    expect(err.message).toBe('Could not retrieve dependent story files.\nstats file not found');
  });

  it('swallows the error for a user who did not ask for TurboSnap', async () => {
    const d = deps();
    traceChangedFilesTurbosnap.mockRejectedValue(new Error('stats file is unreadable'));

    let err;
    let result;
    try {
      result = await traceChangedFiles(d, { ...input(), turboSnap: undefined });
    } catch (error) {
      err = error;
    }

    expect(err).toBeUndefined();
    expect(result).toStrictEqual({ turboSnapOutcome: { mechanism: 'none' } });
    expect(d.log.info).not.toHaveBeenCalled();
    expect(d.report).not.toHaveBeenCalled();
  });

  it('wraps the missing stats file error in Vitest run', async () => {
    const missingStatsError = new Error('stats file not found');
    traceChangedFilesTurbosnap.mockRejectedValue(missingStatsError);

    let err;
    try {
      await traceChangedFiles({ ...deps(), options: { vitest: true } }, input());
    } catch (error) {
      err = error;
    }

    expect(err.message).toBe('Could not retrieve dependent test files.\nstats file not found');
  });

  it('reports tracing with the changed-file count when tracing will run', async () => {
    const d = deps();
    traceChangedFilesTurbosnap.mockImplementation(async (_input, hooks) => {
      hooks?.onTraceWithV1?.();
      return { status: 'skipped', outcome: v1Bailed };
    });

    const result = await traceChangedFiles(d, input());

    expect(result).toStrictEqual({ turboSnapOutcome: v1Bailed });
    expect(d.report).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.stringContaining(
          'Traversing dependencies for 1 file that changed since the last build'
        ),
      })
    );
  });

  it('reports TurboSnap 2.0 instead of the 1.0 trace when the Index applies it', async () => {
    const d = { ...deps(), options: { interactive: false } };
    traceChangedFilesTurbosnap.mockResolvedValue({
      status: 'traced',
      onlyStoryFiles: { './a.stories.js': ['./a.stories.js'] },
      turboSnap: {},
      untracedFiles: [{ filepath: './skipped.js', glob: '*.js' }],
      outcome: { mechanism: 'v2', bailed: false },
    });

    const result = await traceChangedFiles(d, input());

    // The 1.0 story files are still sent with the build.
    expect(result).toMatchObject({
      turboSnapOutcome: { mechanism: 'v2', bailed: false },
      onlyStoryFiles: ['./a.stories.js'],
    });
    expect(d.report).toHaveBeenCalledTimes(1);
    expect(d.report).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Using TurboSnap 2.0' })
    );
    expect(d.log.info).not.toHaveBeenCalled();
  });

  it('warns why TurboSnap 2.0 bailed instead of reporting the 1.0 bail', async () => {
    const d = deps();
    traceChangedFilesTurbosnap.mockResolvedValue({
      status: 'bailed',
      turboSnap: { bailReason: { changedPackageFiles: ['./package.json'] } },
      outcome: { mechanism: 'v2', bailed: true, bailReason: 'NO_ANCESTORS' },
    });

    await traceChangedFiles(d, input());

    expect(d.report).toHaveBeenCalledTimes(1);
    expect(d.report).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'TurboSnap 2.0 disabled',
        output: 'A full build is required because this build has no ancestor builds',
      })
    );
    expect(d.log.warn).toHaveBeenCalledTimes(1);
    expect(d.log.warn).toHaveBeenCalledWith(expect.stringContaining('TurboSnap 2.0 disabled'));
  });

  describe('on a dry run', () => {
    it('logs how many story files TurboSnap 1.0 found', async () => {
      const d = dryRunDeps();
      traceChangedFilesTurbosnap.mockResolvedValue({
        status: 'traced',
        // Two affected story files, one of them reached through two changed modules.
        onlyStoryFiles: { './a.stories.js': ['./a.js', './b.js'], './c.stories.js': ['./c.js'] },
        turboSnap: {},
        untracedFiles: [],
        outcome: v1Traced,
      });

      await traceChangedFiles(d, input());

      expect(d.log.info).toHaveBeenCalledTimes(1);
      expect(d.log.info.mock.calls[0][0]).toContain('TurboSnap enabled (dry run)');
      expect(d.log.info.mock.calls[0][0]).toContain(
        'Found 2 story files potentially affected by recent changes.'
      );
    });

    it('explains why TurboSnap 2.0 has no affected stories to list', async () => {
      const d = dryRunDeps();
      traceChangedFilesTurbosnap.mockResolvedValue({
        status: 'traced',
        onlyStoryFiles: { './a.stories.js': ['./a.stories.js'] },
        turboSnap: {},
        untracedFiles: [],
        outcome: { mechanism: 'v2', bailed: false },
      });

      await traceChangedFiles(d, input());

      expect(d.log.info).toHaveBeenCalledTimes(1);
      const message = d.log.info.mock.calls[0][0];
      expect(message).toContain('TurboSnap 2.0 enabled (dry run)');
      expect(message).toContain('after your Storybook is published');
      expect(message).toContain(
        "there's nothing to compare yet and no potentially affected stories to list"
      );
      // The 1.0 count would disagree with what Chromatic captures under 2.0.
      expect(message).not.toContain('Found');
    });

    it('only warns when TurboSnap 2.0 bails', async () => {
      const d = dryRunDeps();
      traceChangedFilesTurbosnap.mockResolvedValue({
        status: 'bailed',
        turboSnap: { bailReason: { changedPackageFiles: ['./package.json'] } },
        outcome: { mechanism: 'v2', bailed: true, bailReason: 'NO_ANCESTORS' },
      });

      await traceChangedFiles(d, input());

      expect(d.log.info).not.toHaveBeenCalled();
      expect(d.log.warn).toHaveBeenCalledWith(expect.stringContaining('TurboSnap 2.0 disabled'));
    });
  });
});
