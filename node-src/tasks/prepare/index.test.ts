/* eslint-disable max-lines */
import * as turbosnap from '@cli/turbosnap';
import type Listr from 'listr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../../lib/testLogger';
import { Context, FileInfo } from '../../types';
import missingStatsFile from '../../ui/messages/errors/missingStatsFile';
import {
  bailed,
  hashing,
  invalid,
  invalidAndroidArtifact,
  invalidReactNative,
  traced,
  tracing,
} from '../../ui/tasks/prepare';
import { calculateFileHashes } from './calculateFileHashes';
import { applyPrepareOutput, extractPrepareInput, runPrepare } from './index';
import { traceChangedFiles } from './traceChangedFiles';
import { validateAndroidArtifact } from './validateAndroidArtifact';
import { isValidReactNativeStorybook, isValidStorybook, validateFiles } from './validateFiles';

vi.mock('@cli/turbosnap', () => ({
  traceChangedFiles: vi.fn(),
}));
vi.mock('./validateAndroidArtifact');
vi.mock('./traceChangedFiles');
vi.mock('./calculateFileHashes');
vi.mock('./validateFiles', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./validateFiles')>();
  return { ...actual, validateFiles: vi.fn() };
});
vi.mock('../../ui/tasks/prepare', () => ({
  initial: vi.fn(() => ({ status: 'initial', title: 'initial-title' })),
  validating: vi.fn(() => ({
    status: 'pending',
    title: 'validating-title',
    output: 'validating-output',
  })),
  invalid: vi.fn((_ctx, err?: Error) => ({
    status: 'error',
    title: 'invalid-title',
    output: err ? `invalid-output:${err.message}` : 'invalid-output',
  })),
  invalidAndroidArtifact: vi.fn(() => ({
    status: 'error',
    title: 'invalidAndroidArtifact-title',
    output: 'invalidAndroidArtifact-output',
  })),
  invalidReactNative: vi.fn((_ctx, missingFiles?: string[]) => ({
    status: 'error',
    title: 'invalidReactNative-title',
    output: `invalidReactNative-output:${(missingFiles || []).join(',')}`,
  })),
  tracing: vi.fn(() => ({
    status: 'pending',
    title: 'tracing-title',
    output: 'tracing-output',
  })),
  traced: vi.fn(() => ({
    status: 'pending',
    title: 'traced-title',
    output: 'traced-output',
  })),
  bailed: vi.fn(() => ({
    status: 'pending',
    title: 'bailed-title',
    output: 'bailed-output',
  })),
  hashing: vi.fn(() => ({
    status: 'pending',
    title: 'hashing-title',
    output: 'hashing-output',
  })),
  success: vi.fn(() => ({ status: 'success', title: 'success-title' })),
}));
vi.mock('../../ui/messages/errors/missingStatsFile', () => ({
  default: vi.fn(({ legacy }: { legacy: boolean }) =>
    legacy ? 'missing-stats:legacy' : 'missing-stats:non-legacy'
  ),
}));

const validateFilesMock = vi.mocked(validateFiles);
const validateAndroidArtifactMock = vi.mocked(validateAndroidArtifact);
const traceChangedFilesMock = vi.mocked(traceChangedFiles);
const calculateFileHashesMock = vi.mocked(calculateFileHashes);
const turbosnapTraceMock = vi.mocked(turbosnap.traceChangedFiles);
const invalidAndroidArtifactMock = vi.mocked(invalidAndroidArtifact);
const invalidReactNativeMock = vi.mocked(invalidReactNative);
const invalidMock = vi.mocked(invalid);
const missingStatsFileMock = vi.mocked(missingStatsFile);
const tracingMock = vi.mocked(tracing);
const tracedMock = vi.mocked(traced);
const bailedMock = vi.mocked(bailed);
const hashingMock = vi.mocked(hashing);

const log = new TestLogger();

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const fileInfo: FileInfo = {
  paths: ['iframe.html', 'index.html'],
  statsPath: '/static/preview-stats.json',
  lengths: [
    { knownAs: 'iframe.html', pathname: 'iframe.html', contentLength: 42 },
    { knownAs: 'index.html', pathname: 'index.html', contentLength: 42 },
  ],
  total: 84,
};

const makeDeps = (overrides: { options?: any; env?: any } = {}) =>
  ({
    log,
    env: overrides.env ?? { CHROMATIC_HASH_CONCURRENCY: 1 },
    options: overrides.options ?? {},
    packageJson: {},
  }) as any;

const makeInput = (overrides: any = {}) => {
  const { validateFilesInput, traceChangedFilesInput, ...topLevelOverrides } = overrides;
  return {
    validateFilesInput: {
      browsers: [],
      isReactNativeApp: false,
      sourceDir: '/static/',
      validator: vi.fn(),
      validationErrorBuilder: vi.fn(),
      getFileInfoErrorBuilder: vi.fn(),
      ...validateFilesInput,
    },
    invalidAndroidArtifactError: new Error('invalid-android-artifact-error'),
    traceChangedFilesInput: {
      turboSnap: undefined,
      changedFiles: undefined,
      untracedFiles: undefined,
      missingStatsError: vi.fn(() => new Error('missing-stats-error')),
      transitionToTracing: vi.fn(),
      transitionToTraced: vi.fn(),
      transitionToBailed: vi.fn(),
      runInnerTrace: vi.fn(),
      ...traceChangedFilesInput,
    },
    transitionToHashing: vi.fn(),
    ...topLevelOverrides,
  };
};

describe('runPrepare', () => {
  beforeEach(() => {
    validateFilesMock.mockResolvedValue({ fileInfo, sourceDir: '/static/' });
    validateAndroidArtifactMock.mockResolvedValue(true);
    traceChangedFilesMock.mockResolvedValue(undefined);
    calculateFileHashesMock.mockResolvedValue({});
  });

  describe('deviating output directory', () => {
    it('passes the corrected sourceDir to validateAndroidArtifact', async () => {
      validateFilesMock.mockResolvedValue({ fileInfo, sourceDir: '/corrected/' });

      await runPrepare(makeDeps(), makeInput({ validateFilesInput: { browsers: ['android'] } }));

      expect(validateAndroidArtifactMock).toHaveBeenCalledExactlyOnceWith('/corrected/');
    });

    it('passes the corrected sourceDir to calculateFileHashes', async () => {
      validateFilesMock.mockResolvedValue({ fileInfo, sourceDir: '/corrected/' });

      await runPrepare(makeDeps({ options: { fileHashing: true } }), makeInput());

      expect(calculateFileHashesMock).toHaveBeenCalledExactlyOnceWith(
        expect.anything(),
        expect.objectContaining({ sourceDir: '/corrected/' })
      );
    });

    it('includes the corrected sourceDir in the output', async () => {
      validateFilesMock.mockResolvedValue({ fileInfo, sourceDir: '/corrected/' });

      const result = await runPrepare(makeDeps(), makeInput());

      expect(result).toMatchObject({ output: { sourceDir: '/corrected/' } });
    });
  });

  it('returns continue with composed output from each subtask', async () => {
    validateFilesMock.mockResolvedValue({ fileInfo, sourceDir: '/static/' });
    traceChangedFilesMock.mockResolvedValue(['./a.stories.js']);
    calculateFileHashesMock.mockResolvedValue({ 'iframe.html': 'hash' });

    const result = await runPrepare(
      makeDeps({ options: { fileHashing: true } }),
      makeInput({
        traceChangedFilesInput: {
          turboSnap: {},
          changedFiles: ['./example.js'],
        },
      })
    );

    expect(result).toEqual({
      kind: 'continue',
      output: {
        fileInfo,
        sourceDir: '/static/',
        hashes: { 'iframe.html': 'hash' },
        onlyStoryFiles: ['./a.stories.js'],
      },
    });
  });

  it('passes statsPath from validated fileInfo to traceChangedFiles', async () => {
    const input = makeInput({
      traceChangedFilesInput: {
        turboSnap: {},
        changedFiles: ['./example.js'],
      },
    });

    await runPrepare(makeDeps(), input);

    expect(traceChangedFilesMock).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      expect.objectContaining({ statsPath: fileInfo.statsPath })
    );
  });

  it('passes fileInfo and sourceDir to calculateFileHashes', async () => {
    validateFilesMock.mockResolvedValue({ fileInfo, sourceDir: '/build/' });

    await runPrepare(makeDeps({ options: { fileHashing: true } }), makeInput());

    expect(calculateFileHashesMock).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      fileInfo,
      sourceDir: '/build/',
    });
  });

  describe('android branch', () => {
    it('calls validateAndroidArtifact when browsers includes android', async () => {
      validateFilesMock.mockResolvedValue({ fileInfo, sourceDir: '/build/' });

      await runPrepare(
        makeDeps(),
        makeInput({ validateFilesInput: { browsers: ['android', 'ios'] } })
      );

      expect(validateAndroidArtifactMock).toHaveBeenCalledExactlyOnceWith('/build/');
    });

    it('does not call validateAndroidArtifact when browsers omits android', async () => {
      await runPrepare(
        makeDeps(),
        makeInput({ validateFilesInput: { browsers: ['ios', 'chrome'] } })
      );

      expect(validateAndroidArtifactMock).not.toHaveBeenCalled();
    });

    it('throws invalidAndroidArtifactError when validateAndroidArtifact returns false', async () => {
      validateAndroidArtifactMock.mockResolvedValue(false);
      const invalidAndroidArtifactError = new Error('arm-only');

      await expect(
        runPrepare(
          makeDeps(),
          makeInput({
            invalidAndroidArtifactError,
            validateFilesInput: { browsers: ['android'] },
          })
        )
      ).rejects.toBe(invalidAndroidArtifactError);
    });

    it('does not throw when validateAndroidArtifact returns true', async () => {
      validateAndroidArtifactMock.mockResolvedValue(true);

      await expect(
        runPrepare(makeDeps(), makeInput({ validateFilesInput: { browsers: ['android'] } }))
      ).resolves.toBeDefined();
    });
  });

  describe('turbosnap branch', () => {
    it('skips traceChangedFiles when turboSnap is undefined', async () => {
      await runPrepare(
        makeDeps(),
        makeInput({
          traceChangedFilesInput: { turboSnap: undefined, changedFiles: ['./a.js'] },
        })
      );

      expect(traceChangedFilesMock).not.toHaveBeenCalled();
    });

    it('skips traceChangedFiles when turboSnap.unavailable is true', async () => {
      await runPrepare(
        makeDeps(),
        makeInput({
          traceChangedFilesInput: {
            turboSnap: { unavailable: true },
            changedFiles: ['./a.js'],
          },
        })
      );

      expect(traceChangedFilesMock).not.toHaveBeenCalled();
    });

    it('skips traceChangedFiles when changedFiles is undefined', async () => {
      await runPrepare(
        makeDeps(),
        makeInput({
          traceChangedFilesInput: { turboSnap: {}, changedFiles: undefined },
        })
      );

      expect(traceChangedFilesMock).not.toHaveBeenCalled();
    });

    it('throws missingStatsError when statsPath is empty', async () => {
      validateFilesMock.mockResolvedValue({
        fileInfo: { ...fileInfo, statsPath: '' },
        sourceDir: '/static/',
      });
      const missingStatsError = vi.fn(() => new Error('missing-stats!'));

      await expect(
        runPrepare(
          makeDeps(),
          makeInput({
            traceChangedFilesInput: {
              turboSnap: {},
              changedFiles: ['./a.js'],
              missingStatsError,
            },
          })
        )
      ).rejects.toThrow('missing-stats!');
      expect(missingStatsError).toHaveBeenCalled();
      expect(traceChangedFilesMock).not.toHaveBeenCalled();
    });

    it('rewrites error message when inner traceChangedFiles throws', async () => {
      traceChangedFilesMock.mockRejectedValue(new Error('inner-trace-failed'));

      await expect(
        runPrepare(
          makeDeps({ options: { interactive: true } }),
          makeInput({
            traceChangedFilesInput: { turboSnap: {}, changedFiles: ['./a.js'] },
          })
        )
      ).rejects.toThrow('Could not retrieve dependent story files.\ninner-trace-failed');
    });

    it('logs info when traceChangedFiles throws and not interactive', async () => {
      traceChangedFilesMock.mockRejectedValue(new Error('inner-trace-failed'));

      await expect(
        runPrepare(
          makeDeps({ options: { interactive: false } }),
          makeInput({
            traceChangedFilesInput: {
              turboSnap: {},
              changedFiles: ['./example.js'],
            },
          })
        )
      ).rejects.toThrow();

      expect(log.info).toHaveBeenCalledWith(
        'Failed to retrieve dependent story files',
        expect.objectContaining({
          statsPath: fileInfo.statsPath,
          changedFiles: ['./example.js'],
        })
      );
    });

    it('does not log info when traceChangedFiles throws and interactive', async () => {
      traceChangedFilesMock.mockRejectedValue(new Error('inner-trace-failed'));

      await expect(
        runPrepare(
          makeDeps({ options: { interactive: true } }),
          makeInput({
            traceChangedFilesInput: {
              turboSnap: {},
              changedFiles: ['./example.js'],
            },
          })
        )
      ).rejects.toThrow();

      expect(log.info).not.toHaveBeenCalled();
    });
  });

  describe('file-hashing branch', () => {
    it('skips hashing when options.fileHashing is falsy', async () => {
      const transitionToHashing = vi.fn();

      const result = await runPrepare(
        makeDeps({ options: {} }),
        makeInput({ transitionToHashing })
      );

      expect(calculateFileHashesMock).not.toHaveBeenCalled();
      expect(transitionToHashing).not.toHaveBeenCalled();
      expect(result).toMatchObject({ output: { hashes: undefined } });
    });

    it('calls transitionToHashing before calculateFileHashes', async () => {
      const order: string[] = [];
      const transitionToHashing = vi.fn(() => {
        order.push('transition');
      });
      calculateFileHashesMock.mockImplementation(async () => {
        order.push('hash');
        return {};
      });

      await runPrepare(
        makeDeps({ options: { fileHashing: true } }),
        makeInput({ transitionToHashing })
      );

      expect(order).toEqual(['transition', 'hash']);
    });

    it('swallows calculateFileHashes errors with warn+debug logs', async () => {
      const err = new Error('hash-failed');
      calculateFileHashesMock.mockRejectedValue(err);

      const result = await runPrepare(makeDeps({ options: { fileHashing: true } }), makeInput());

      expect(result).toMatchObject({ output: { hashes: undefined } });
      expect(log.warn).toHaveBeenCalledWith('Failed to calculate file hashes');
      expect(log.debug).toHaveBeenCalledWith(err);
    });
  });
});

const makeListrTask = () =>
  ({
    title: '',
    output: '',
    skip: vi.fn(),
    report: vi.fn(),
  }) as unknown as Listr.ListrTaskWrapper<Context>;

const makeContext = (overrides: Record<string, any> = {}): Context =>
  ({
    log,
    sourceDir: '/static/',
    buildLogFile: undefined,
    announcedBuild: undefined,
    isReactNativeApp: false,
    storybook: undefined,
    git: { changedFiles: undefined },
    turboSnap: undefined,
    untracedFiles: undefined,
    options: {},
    ...overrides,
  }) as any;

describe('extractPrepareInput', () => {
  describe('field mapping', () => {
    it('passes through sourceDir, buildLogFile, browsers, isReactNativeApp', () => {
      const ctx = makeContext({
        sourceDir: '/build/',
        buildLogFile: 'build.log',
        announcedBuild: { browsers: ['android', 'ios'] },
        isReactNativeApp: true,
      });

      const result = extractPrepareInput(ctx, makeListrTask());

      expect(result.validateFilesInput).toMatchObject({
        sourceDir: '/build/',
        buildLogFile: 'build.log',
        browsers: ['android', 'ios'],
        isReactNativeApp: true,
      });
    });

    it('defaults browsers to [] when announcedBuild.browsers is undefined', () => {
      const ctx = makeContext({ announcedBuild: {} });

      const result = extractPrepareInput(ctx, makeListrTask());

      expect(result.validateFilesInput.browsers).toEqual([]);
    });

    it('defaults isReactNativeApp to false when undefined', () => {
      const ctx = makeContext({ isReactNativeApp: undefined });

      const result = extractPrepareInput(ctx, makeListrTask());

      expect(result.validateFilesInput.isReactNativeApp).toBe(false);
    });

    it('mirrors turboSnap, changedFiles, untracedFiles from ctx', () => {
      const ctx = makeContext({
        turboSnap: { foo: 'bar' },
        git: { changedFiles: ['./a.js'] },
        untracedFiles: ['./b.js'],
      });

      const result = extractPrepareInput(ctx, makeListrTask());

      expect(result.traceChangedFilesInput).toMatchObject({
        turboSnap: { foo: 'bar' },
        changedFiles: ['./a.js'],
        untracedFiles: ['./b.js'],
      });
    });
  });

  describe('validator closure', () => {
    it('calls isValidStorybook when not React Native', () => {
      const ctx = makeContext({ isReactNativeApp: false });
      const result = extractPrepareInput(ctx, makeListrTask());

      const expected = isValidStorybook({ paths: ['iframe.html'], total: 1 });
      expect(
        result.validateFilesInput.validator({ paths: ['iframe.html'], total: 1 } as FileInfo, [
          'chrome',
        ])
      ).toEqual(expected);
    });

    it('calls isValidReactNativeStorybook when React Native', () => {
      const ctx = makeContext({ isReactNativeApp: true });
      const result = extractPrepareInput(ctx, makeListrTask());

      const expected = isValidReactNativeStorybook(
        { paths: ['storybook.apk', 'manifest.json'], total: 1 },
        ['android']
      );
      expect(
        result.validateFilesInput.validator(
          { paths: ['storybook.apk', 'manifest.json'], total: 1 } as FileInfo,
          ['android']
        )
      ).toEqual(expected);
    });
  });

  describe('validationErrorBuilder closure', () => {
    it('uses invalid() for non-React-Native ctx', () => {
      const ctx = makeContext({ isReactNativeApp: false });
      const result = extractPrepareInput(ctx, makeListrTask());

      const err = result.validateFilesInput.validationErrorBuilder([]);

      expect(err.message).toBe('invalid-output');
      expect(invalidMock).toHaveBeenCalledWith(ctx);
    });

    it('uses invalidReactNative() with missingFiles for React Native ctx', () => {
      const ctx = makeContext({ isReactNativeApp: true });
      const result = extractPrepareInput(ctx, makeListrTask());

      const err = result.validateFilesInput.validationErrorBuilder([
        'storybook.apk',
        'manifest.json',
      ]);

      expect(err.message).toBe('invalidReactNative-output:storybook.apk,manifest.json');
      expect(invalidReactNativeMock).toHaveBeenCalledWith(ctx, ['storybook.apk', 'manifest.json']);
    });
  });

  describe('getFileInfoErrorBuilder closure', () => {
    it('wraps cause via invalid(ctx, err)', () => {
      const ctx = makeContext();
      const cause = new Error('ENOENT');
      const result = extractPrepareInput(ctx, makeListrTask());

      const err = result.validateFilesInput.getFileInfoErrorBuilder(cause);

      expect(err.message).toBe('invalid-output:ENOENT');
      expect(invalidMock).toHaveBeenCalledWith(ctx, cause);
    });
  });

  describe('missingStatsError closure', () => {
    it('sets turboSnap.bailReason when turboSnap is defined', () => {
      const turboSnap: any = {};
      const ctx = makeContext({ turboSnap });
      const result = extractPrepareInput(ctx, makeListrTask());

      result.traceChangedFilesInput.missingStatsError();

      expect(turboSnap.bailReason).toEqual({ missingStatsFile: true });
    });

    it('does not throw when turboSnap is undefined', () => {
      const ctx = makeContext({ turboSnap: undefined });
      const result = extractPrepareInput(ctx, makeListrTask());

      expect(() => result.traceChangedFilesInput.missingStatsError()).not.toThrow();
    });

    it('builds non-legacy error when storybook.version >= 8.0.0', () => {
      const ctx = makeContext({ storybook: { version: '8.1.0' } });
      const result = extractPrepareInput(ctx, makeListrTask());

      const err = result.traceChangedFilesInput.missingStatsError();

      expect(err.message).toBe('missing-stats:non-legacy');
      expect(missingStatsFileMock).toHaveBeenCalledWith({ legacy: false });
    });

    it('builds legacy error when storybook.version < 8.0.0', () => {
      const ctx = makeContext({ storybook: { version: '7.6.0' } });
      const result = extractPrepareInput(ctx, makeListrTask());

      const err = result.traceChangedFilesInput.missingStatsError();

      expect(err.message).toBe('missing-stats:legacy');
      expect(missingStatsFileMock).toHaveBeenCalledWith({ legacy: true });
    });

    it('builds legacy error when storybook.version is unknown', () => {
      const ctx = makeContext({ storybook: undefined });
      const result = extractPrepareInput(ctx, makeListrTask());

      const err = result.traceChangedFilesInput.missingStatsError();

      expect(err.message).toBe('missing-stats:legacy');
      expect(missingStatsFileMock).toHaveBeenCalledWith({ legacy: true });
    });
  });

  describe('invalidAndroidArtifactError', () => {
    it('uses invalidAndroidArtifact(ctx).output as its message', () => {
      const ctx = makeContext();
      const result = extractPrepareInput(ctx, makeListrTask());

      expect(result.invalidAndroidArtifactError.message).toBe('invalidAndroidArtifact-output');
      expect(invalidAndroidArtifactMock).toHaveBeenCalledWith(ctx);
    });
  });

  describe('transition closures', () => {
    it('transitionToTracing mutates listrTask using tracing UI state', () => {
      const ctx = makeContext();
      const listrTask = makeListrTask();
      const result = extractPrepareInput(ctx, listrTask);

      result.traceChangedFilesInput.transitionToTracing();

      expect(tracingMock).toHaveBeenCalledWith(ctx);
      expect(listrTask.title).toBe('tracing-title');
      expect(listrTask.output).toBe('tracing-output');
    });

    it('transitionToTraced mutates listrTask using traced UI state', () => {
      const ctx = makeContext();
      const listrTask = makeListrTask();
      const result = extractPrepareInput(ctx, listrTask);

      result.traceChangedFilesInput.transitionToTraced();

      expect(tracedMock).toHaveBeenCalledWith(ctx);
      expect(listrTask.title).toBe('traced-title');
      expect(listrTask.output).toBe('traced-output');
    });

    it('transitionToBailed mutates listrTask using bailed UI state', () => {
      const ctx = makeContext();
      const listrTask = makeListrTask();
      const result = extractPrepareInput(ctx, listrTask);

      result.traceChangedFilesInput.transitionToBailed();

      expect(bailedMock).toHaveBeenCalledWith(ctx);
      expect(listrTask.title).toBe('bailed-title');
      expect(listrTask.output).toBe('bailed-output');
    });

    it('transitionToHashing mutates listrTask using hashing UI state', () => {
      const ctx = makeContext();
      const listrTask = makeListrTask();
      const result = extractPrepareInput(ctx, listrTask);

      result.transitionToHashing();

      expect(hashingMock).toHaveBeenCalledWith(ctx);
      expect(listrTask.title).toBe('hashing-title');
      expect(listrTask.output).toBe('hashing-output');
    });
  });

  describe('runInnerTrace closure', () => {
    it('forwards (ctx, statsPath) to turbosnap.traceChangedFiles', () => {
      const ctx = makeContext();
      const result = extractPrepareInput(ctx, makeListrTask());

      result.traceChangedFilesInput.runInnerTrace('/some/stats.json');

      expect(turbosnapTraceMock).toHaveBeenCalledWith(ctx, '/some/stats.json');
    });
  });
});

describe('applyPrepareOutput', () => {
  it('writes the corrected sourceDir to ctx', () => {
    const ctx = makeContext({ sourceDir: '/original/' });

    applyPrepareOutput(ctx, {
      fileInfo,
      hashes: undefined,
      onlyStoryFiles: undefined,
      sourceDir: '/corrected/',
    });

    expect(ctx.sourceDir).toBe('/corrected/');
  });

  it('sets ctx.fileInfo with hashes merged in', () => {
    const ctx = makeContext();
    const hashes = { 'iframe.html': 'hash-a' };

    applyPrepareOutput(ctx, {
      fileInfo,
      hashes,
      onlyStoryFiles: undefined,
      sourceDir: '/static/',
    });

    expect(ctx.fileInfo).toEqual({ ...fileInfo, hashes });
  });

  it('sets ctx.fileInfo with hashes undefined when hashes omitted', () => {
    const ctx = makeContext();

    applyPrepareOutput(ctx, {
      fileInfo,
      hashes: undefined,
      onlyStoryFiles: undefined,
      sourceDir: '/static/',
    });

    expect(ctx.fileInfo).toEqual({ ...fileInfo, hashes: undefined });
    expect(ctx.fileInfo).toHaveProperty('hashes', undefined);
  });

  it('sets ctx.onlyStoryFiles from output', () => {
    const ctx = makeContext();

    applyPrepareOutput(ctx, {
      fileInfo,
      hashes: undefined,
      onlyStoryFiles: ['./a.stories.js'],
      sourceDir: '/static/',
    });

    expect(ctx.onlyStoryFiles).toEqual(['./a.stories.js']);
  });

  it('sets ctx.onlyStoryFiles to undefined when output omits it', () => {
    const ctx = makeContext({ onlyStoryFiles: ['stale'] });

    applyPrepareOutput(ctx, {
      fileInfo,
      hashes: undefined,
      onlyStoryFiles: undefined,
      sourceDir: '/static/',
    });

    expect(ctx.onlyStoryFiles).toBeUndefined();
  });
});
