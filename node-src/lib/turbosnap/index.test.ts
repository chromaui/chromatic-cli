import * as Sentry from '@sentry/node';
import { access } from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { exitCodes } from '../setExitCode';
import TestLogger from '../testLogger';
import { traceChangedFiles } from '.';
import { classifyTagsFromError as classifyTagsFromErrorDep } from './classifyBailRootCause';
import {
  BaselineCheckoutFailedError,
  LockFileParseFailedError,
  LockFileSizeExceededError,
} from './errors';
import { findChangedDependencies as findChangedDependenciesDep } from './findChangedDependencies';
import { findChangedPackageFiles as findChangedPackageFilesDep } from './findChangedPackageFiles';
import { getDependentStoryFiles as getDependentStoryFilesDep } from './getDependentStoryFiles';

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(() => 'sentry-event-id'),
}));
vi.mock('fs');
vi.mock('./findChangedDependencies', async (importOriginal) => {
  const originalModule = await importOriginal<typeof import('./findChangedDependencies')>();
  return {
    ...originalModule,
    findChangedDependencies: vi.fn(),
  };
});
vi.mock('./findChangedPackageFiles');
vi.mock('./getDependentStoryFiles');
vi.mock('./classifyBailRootCause');
vi.mock('../../tasks/readStatsFile', () => ({
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

const getDependentStoryFiles = vi.mocked(getDependentStoryFilesDep);
const findChangedPackageFiles = vi.mocked(findChangedPackageFilesDep);
const findChangedDependencies = vi.mocked(findChangedDependenciesDep);
const classifyTagsFromError = vi.mocked(classifyTagsFromErrorDep);
const accessMock = vi.mocked(access);
const captureException = vi.mocked(Sentry.captureException);

const environment = { CHROMATIC_RETRIES: 2, CHROMATIC_OUTPUT_INTERVAL: 0 };
const log = new TestLogger();
const http = { fetch: vi.fn() };

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  accessMock.mockImplementation((_path, callback) => Promise.resolve(callback(null)));
});

describe('traceChangedFiles', () => {
  it('does not run package dependency analysis if there are no metadata changes', async () => {
    const deps = { 123: ['./example.stories.js'] };
    getDependentStoryFiles.mockResolvedValue({
      status: 'traced',
      onlyStoryFiles: deps,
      turboSnap: {},
      untracedFiles: [],
    });

    const ctx = {
      env: environment,
      log,
      http,
      options: {},
      sourceDir: '/static/',
      fileInfo: { statsPath: '/static/preview-stats.json' },
      git: { changedFiles: ['./example.js'] },
      turboSnap: {},
    } as any;
    const result = await traceChangedFiles(ctx);

    expect(result).toStrictEqual({
      status: 'traced',
      onlyStoryFiles: deps,
      turboSnap: {},
      changedDependencyNames: undefined,
      untracedFiles: [],
    });
    expect(findChangedDependencies).not.toHaveBeenCalled();
    expect(findChangedPackageFiles).not.toHaveBeenCalled();
  });

  const findChangedDependenciesFailureCases = [
    {
      name: 'lockfileSizeExceeded',
      error: new LockFileSizeExceededError('/tmp/checkout-abc/pnpm-lock.yaml', 12_000_000),
      expectedBailReason: {
        changedPackageFiles: ['./package.json'],
        bailSubreason: 'lockfileSizeExceeded',
        lockfileKind: 'pnpm-lock.yaml',
        lockfileSizeBytes: 12_000_000,
        sentryEventId: 'sentry-event-id',
      },
      expectedKey: 'lockfileSizeExceeded',
      expectFingerprint: true,
    },
    {
      name: 'lockfileParseFailed',
      error: new LockFileParseFailedError('/tmp/checkout-abc/yarn.lock', {
        cause: new Error('inner'),
      }),
      expectedBailReason: {
        changedPackageFiles: ['./package.json'],
        bailSubreason: 'lockfileParseFailed',
        lockfileKind: 'yarn.lock',
        sentryEventId: 'sentry-event-id',
      },
      expectedKey: 'lockfileParseFailed',
      expectFingerprint: true,
    },
    {
      name: 'baselineCheckoutFailed',
      error: new BaselineCheckoutFailedError('abc:package.json'),
      expectedBailReason: {
        changedPackageFiles: ['./package.json'],
        bailSubreason: 'baselineCheckoutFailed',
        sentryEventId: 'sentry-event-id',
      },
      expectedKey: 'baselineCheckoutFailed',
      expectedFailureKind: 'baselineManifestMoved',
      expectFingerprint: true,
    },
    {
      name: 'unknown',
      error: new Error('something else'),
      expectedBailReason: {
        changedPackageFiles: ['./package.json'],
        sentryEventId: 'sentry-event-id',
      },
      expectedKey: undefined,
      expectFingerprint: false,
    },
  ];

  for (const {
    name,
    error,
    expectedBailReason,
    expectedKey,
    expectedFailureKind,
    expectFingerprint,
  } of findChangedDependenciesFailureCases) {
    it(`bails on package.json changes and tags bailReason as ${name}`, async () => {
      findChangedDependencies.mockRejectedValue(error);
      findChangedPackageFiles.mockResolvedValue(['./package.json']);
      classifyTagsFromError.mockImplementation(async (_deps, err) =>
        err instanceof BaselineCheckoutFailedError
          ? { baseline_failure_kind: 'baselineManifestMoved' }
          : undefined
      );

      const packageMetadataChanges = [{ changedFiles: ['./package.json'], commit: 'abcdef' }];
      const ctx = {
        env: environment,
        log,
        http,
        options: {},
        sourceDir: '/static/',
        fileInfo: { statsPath: '/static/preview-stats.json' },
        git: { changedFiles: ['./example.js', './package.json'], packageMetadataChanges },
        turboSnap: {},
      } as any;
      const result = await traceChangedFiles(ctx);

      expect(result).toMatchObject({
        status: 'bailed',
        turboSnap: {
          bailReason: expectedBailReason,
        },
      });
      expect(captureException).toHaveBeenCalledTimes(1);
      expect(captureException).toHaveBeenCalledWith(error, {
        tags: {
          bail_path: 'findChangedDependencies',
          ...(expectedKey && { bail_detail: expectedKey }),
          ...(expectedFailureKind && { baseline_failure_kind: expectedFailureKind }),
        },
        ...(expectFingerprint && { fingerprint: [expectedKey] }),
      });
    });
  }

  it('returns dependency changes', async () => {
    findChangedDependencies.mockResolvedValue(['moment']);
    findChangedPackageFiles.mockResolvedValue([]);
    getDependentStoryFiles.mockResolvedValue({
      status: 'traced',
      onlyStoryFiles: {},
      turboSnap: {},
      untracedFiles: [],
    });

    const packageMetadataChanges = [{ changedFiles: ['./package.json'], commit: 'abcdef' }];
    const ctx = {
      env: environment,
      log,
      http,
      options: {},
      sourceDir: '/static/',
      fileInfo: { statsPath: '/static/preview-stats.json' },
      git: { changedFiles: ['./example.js', './package.json'], packageMetadataChanges },
      turboSnap: {},
    } as any;
    const result = await traceChangedFiles(ctx);

    expect(result).toMatchObject({
      status: 'traced',
      changedDependencyNames: ['moment'],
    });
    expect(ctx.git.changedDependencyNames).toBeUndefined();
  });

  it('throws an error if storybookBaseDir is incorrect', async () => {
    const deps = { 123: ['./example.stories.js'] };
    findChangedDependencies.mockResolvedValue([]);
    findChangedPackageFiles.mockResolvedValue([]);
    getDependentStoryFiles.mockResolvedValue({
      status: 'traced',
      onlyStoryFiles: deps,
      turboSnap: {},
      untracedFiles: [],
    });
    accessMock.mockImplementation((_path, callback) =>
      Promise.resolve(callback(new Error('some error')))
    );

    const ctx = {
      env: environment,
      log,
      http,
      options: { storybookBaseDir: '/wrong' },
      sourceDir: '/static/',
      fileInfo: { statsPath: '/static/preview-stats.json' },
      git: { changedFiles: ['./example.js'] },
      turboSnap: {},
    } as any;
    let err;
    try {
      await traceChangedFiles(ctx);
    } catch (error) {
      err = error;
    }
    expect(err).toBeTruthy();
    expect(ctx.exitCode).toBe(exitCodes.INVALID_OPTIONS);
  });

  it('continues story file tracing if no dependencies are changed in package.json (fallback scenario)', async () => {
    const deps = { 123: ['./example.stories.js'] };
    findChangedDependencies.mockRejectedValue(new Error('no lockfile'));
    findChangedPackageFiles.mockResolvedValue([]); // no dependency changes
    getDependentStoryFiles.mockResolvedValue({
      status: 'traced',
      onlyStoryFiles: deps,
      turboSnap: {},
      untracedFiles: [],
    });

    const packageMetadataChanges = [{ changedFiles: ['./package.json'], commit: 'abcdef' }];
    const ctx = {
      env: environment,
      log,
      http,
      options: {},
      sourceDir: '/static/',
      fileInfo: { statsPath: '/static/preview-stats.json' },
      git: { changedFiles: ['./example.js', './package.json'], packageMetadataChanges },
      turboSnap: {},
    } as any;
    const result = await traceChangedFiles(ctx);

    expect(result).toMatchObject({
      status: 'traced',
      onlyStoryFiles: deps,
      turboSnap: {}, // checking there is no bailReason set
    });
    expect(findChangedPackageFiles).toHaveBeenCalledWith(ctx, packageMetadataChanges);
  });

  it('does not set bailReason or capture to Sentry when findChangedDependencies fails but findChangedPackageFiles is empty', async () => {
    const error = new LockFileSizeExceededError('/tmp/x', 999);
    findChangedDependencies.mockRejectedValue(error);
    findChangedPackageFiles.mockResolvedValue([]);
    getDependentStoryFiles.mockResolvedValue({
      status: 'traced',
      onlyStoryFiles: {},
      turboSnap: {},
      untracedFiles: [],
    });

    const packageMetadataChanges = [{ changedFiles: ['./package.json'], commit: 'abcdef' }];
    const ctx = {
      env: environment,
      log,
      http,
      options: {},
      sourceDir: '/static/',
      fileInfo: { statsPath: '/static/preview-stats.json' },
      git: { changedFiles: ['./example.js', './package.json'], packageMetadataChanges },
      turboSnap: {},
    } as any;
    const result = await traceChangedFiles(ctx);

    expect(result).toMatchObject({
      status: 'traced',
      turboSnap: {}, // checking there is no bailReason set
    });
    expect(captureException).not.toHaveBeenCalled();
  });

  it('throws if stats file is not found', async () => {
    const packageMetadataChanges = [{ changedFiles: ['./package.json'], commit: 'abcdef' }];
    const ctx = {
      env: environment,
      log,
      http,
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

  it('returns skipped when TurboSnap is unavailable', async () => {
    const ctx = {
      env: environment,
      log,
      http,
      options: {},
      git: {},
      turboSnap: { unavailable: true },
    } as any;

    const result = await traceChangedFiles(ctx);

    expect(result).toStrictEqual({ status: 'skipped' });
  });

  it('bails without mutating ctx when package files changed', async () => {
    findChangedDependencies.mockRejectedValue(new Error('no lockfile'));
    findChangedPackageFiles.mockResolvedValue(['./package.json']);

    const packageMetadataChanges = [{ changedFiles: ['./package.json'], commit: 'abcdef' }];
    const ctx = {
      env: environment,
      log,
      http,
      options: {},
      sourceDir: '/static/',
      fileInfo: { statsPath: '/static/preview-stats.json' },
      git: { changedFiles: ['./example.js', './package.json'], packageMetadataChanges },
      turboSnap: {},
    } as any;

    const result = await traceChangedFiles(ctx);

    expect(result.status).toBe('bailed');
    expect(ctx.turboSnap.bailReason).toBeUndefined();
    expect(ctx.git.changedDependencyNames).toBeUndefined();
  });
});
