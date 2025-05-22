import { access } from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { exitCodes } from '../setExitCode';
import { traceChangedFiles } from '.';
import { findChangedDependencies as findChangedDependenciesDep } from './findChangedDependencies';
import { findChangedPackageFiles as findChangedPackageFilesDep } from './findChangedPackageFiles';
import { getDependentStoryFiles as getDependentStoryFilesDep } from './getDependentStoryFiles';

vi.mock('fs');
vi.mock('./findChangedDependencies');
vi.mock('./findChangedPackageFiles');
vi.mock('./getDependentStoryFiles');
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
const accessMock = vi.mocked(access);

const environment = { CHROMATIC_RETRIES: 2, CHROMATIC_OUTPUT_INTERVAL: 0 };
const log = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };
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
    getDependentStoryFiles.mockResolvedValue(deps);

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
    const onlyStoryFiles = await traceChangedFiles(ctx);

    expect(onlyStoryFiles).toStrictEqual(deps);
    expect(findChangedDependencies).not.toHaveBeenCalled();
    expect(findChangedPackageFiles).not.toHaveBeenCalled();
  });

  it('bails on package.json changes if it fails to retrieve lockfile changes (fallback scenario)', async () => {
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
    await traceChangedFiles(ctx);

    expect(ctx.turboSnap.bailReason).toEqual({ changedPackageFiles: ['./package.json'] });
    expect(findChangedPackageFiles).toHaveBeenCalledWith(ctx, packageMetadataChanges);
    expect(getDependentStoryFiles).not.toHaveBeenCalled();
  });

  it('stores dependency changes', async () => {
    findChangedDependencies.mockResolvedValue(['moment']);
    findChangedPackageFiles.mockResolvedValue([]);

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
    await traceChangedFiles(ctx);

    expect(ctx.git.changedDependencyNames).toEqual(['moment']);
  });

  it('throws an error if storybookBaseDir is incorrect', async () => {
    const deps = { 123: ['./example.stories.js'] };
    findChangedDependencies.mockResolvedValue([]);
    findChangedPackageFiles.mockResolvedValue([]);
    getDependentStoryFiles.mockResolvedValue(deps);
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
    await expect(traceChangedFiles(ctx)).rejects.toThrow();
    expect(ctx.exitCode).toBe(exitCodes.INVALID_OPTIONS);
  });

  it('continues story file tracing if no dependencies are changed in package.json (fallback scenario)', async () => {
    const deps = { 123: ['./example.stories.js'] };
    findChangedDependencies.mockRejectedValue(new Error('no lockfile'));
    findChangedPackageFiles.mockResolvedValue([]); // no dependency changes
    getDependentStoryFiles.mockResolvedValue(deps);

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
    const onlyStoryFiles = await traceChangedFiles(ctx);

    expect(ctx.turboSnap.bailReason).toBeUndefined();
    expect(onlyStoryFiles).toStrictEqual(deps);
    expect(findChangedPackageFiles).toHaveBeenCalledWith(ctx, packageMetadataChanges);
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

    await expect(traceChangedFiles(ctx)).rejects.toThrow();
    expect(ctx.turboSnap.bailReason).toEqual({ missingStatsFile: true });
  });
});
