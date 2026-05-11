import { afterEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../../lib/testLogger';
import { Deps } from '../../types';
import { traceChangedFiles, TraceChangedFilesInput } from './traceChangedFiles';

const log = new TestLogger();

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

const makeDeps = (options: Partial<Deps['options']> = {}) =>
  ({
    log,
    options: options as Deps['options'],
  }) as Pick<Deps, 'log' | 'options'>;

const makeInput = (overrides: Partial<TraceChangedFilesInput> = {}): TraceChangedFilesInput => ({
  untracedFiles: undefined,
  transitionToTracing: vi.fn(),
  transitionToTraced: vi.fn(),
  transitionToBailed: vi.fn(),
  statsPath: '/static/stats.json',
  runInnerTrace: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe('traceChangedFiles', () => {
  it('returns onlyStoryFiles from the inner trace result', async () => {
    const innerResult = { 123: ['./example.stories.js'] };
    const result = await traceChangedFiles(
      makeDeps(),
      makeInput({ runInnerTrace: vi.fn().mockResolvedValue(innerResult) })
    );

    expect(result).toStrictEqual(Object.keys(innerResult));
  });

  it('escapes special characters in returned onlyStoryFiles', async () => {
    const innerResult = {
      './$example-new.stories.js': ['./$example-new.stories.js'],
      './+example-new.stories.js': ['./+example-new.stories.js'],
      './example-(new).stories.js': ['./example-(new).stories.js'],
      './example[[lang=language]].stories.js': ['./example[[lang=language]].stories.js'],
      '[./example/[account]/[id]/[unit]/language/example.stories.tsx]': [
        '[./example/[account]/[id]/[unit]/language/example.stories.tsx]',
      ],
    };
    const result = await traceChangedFiles(
      makeDeps(),
      makeInput({ runInnerTrace: vi.fn().mockResolvedValue(innerResult) })
    );

    expect(result).toStrictEqual([
      String.raw`./\$example-new.stories.js`,
      String.raw`./\+example-new.stories.js`,
      String.raw`./example-\(new\).stories.js`,
      String.raw`./example\[\[lang=language\]\].stories.js`,
      String.raw`\[./example/\[account\]/\[id\]/\[unit\]/language/example.stories.tsx\]`,
    ]);
  });

  it('calls transitionToBailed and returns undefined when inner trace returns undefined', async () => {
    const transitionToBailed = vi.fn();
    const transitionToTraced = vi.fn();
    const result = await traceChangedFiles(
      makeDeps(),
      makeInput({
        runInnerTrace: vi.fn().mockResolvedValue(undefined),
        transitionToBailed,
        transitionToTraced,
      })
    );
    expect(result).toBeUndefined();
    expect(transitionToBailed).toHaveBeenCalled();
    expect(transitionToTraced).not.toHaveBeenCalled();
  });

  it('calls transitionToTracing and transitionToTraced on success', async () => {
    const transitionToTracing = vi.fn();
    const transitionToTraced = vi.fn();
    const transitionToBailed = vi.fn();
    await traceChangedFiles(
      makeDeps(),
      makeInput({
        runInnerTrace: vi.fn().mockResolvedValue({ 1: ['./a.stories.js'] }),
        transitionToTracing,
        transitionToTraced,
        transitionToBailed,
      })
    );
    expect(transitionToTracing).toHaveBeenCalled();
    expect(transitionToTraced).toHaveBeenCalled();
    expect(transitionToBailed).not.toHaveBeenCalled();
  });

  it('logs affected story files when non-interactive and traceChanged is false', async () => {
    await traceChangedFiles(
      makeDeps({ interactive: false, traceChanged: false } as any),
      makeInput({ runInnerTrace: vi.fn().mockResolvedValue({ 1: ['./a.stories.js'] }) })
    );
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('Found affected story files'));
  });

  it('does not log affected story files when interactive', async () => {
    await traceChangedFiles(
      makeDeps({ interactive: true } as any),
      makeInput({ runInnerTrace: vi.fn().mockResolvedValue({ 1: ['./a.stories.js'] }) })
    );
    expect(log.info).not.toHaveBeenCalled();
  });

  it('does not log affected story files when traceChanged is true', async () => {
    await traceChangedFiles(
      makeDeps({ interactive: false, traceChanged: true } as any),
      makeInput({ runInnerTrace: vi.fn().mockResolvedValue({ 1: ['./a.stories.js'] }) })
    );
    expect(log.info).not.toHaveBeenCalledWith(
      expect.stringContaining('Found affected story files')
    );
  });

  it('logs untraced files when present and non-interactive', async () => {
    await traceChangedFiles(
      makeDeps({ interactive: false, traceChanged: true } as any),
      makeInput({
        runInnerTrace: vi.fn().mockResolvedValue({ 1: ['./a.stories.js'] }),
        untracedFiles: ['./untraced.js'],
      })
    );
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('1 untraced files'));
  });
});
