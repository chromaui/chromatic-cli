import { FormData } from 'formdata-node';
import { access, createReadStream, readdirSync, readFileSync, statSync } from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { default as compress } from '../lib/compress';
import { findChangedDependencies as findChangedDep } from '../lib/findChangedDependencies';
import { findChangedPackageFiles as findChangedPkg } from '../lib/findChangedPackageFiles';
import { getDependentStoryFiles as getDepStoryFiles } from '../lib/getDependentStoryFiles';
import {
  calculateFileHashes,
  traceChangedFiles,
  uploadStorybook,
  validateFiles,
  waitForSentinels,
} from './upload';
import { exitCodes } from '../lib/setExitCode';

vi.mock('form-data');
vi.mock('fs');
vi.mock('../lib/compress');
vi.mock('../lib/getDependentStoryFiles');
vi.mock('../lib/findChangedDependencies');
vi.mock('../lib/findChangedPackageFiles');
vi.mock('./read-stats-file', () => ({
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

vi.mock('../lib/FileReaderBlob', () => ({
  FileReaderBlob: class {
    constructor(path: string, length: number, onProgress: (delta: number) => void) {
      onProgress(length / 2);
      onProgress(length / 2);
    }
  },
}));

vi.mock('../lib/getFileHashes', () => ({
  getFileHashes: (files: string[]) =>
    Promise.resolve(Object.fromEntries(files.map((f) => [f, 'hash']))),
}));

const makeZipFile = vi.mocked(compress);
const findChangedDependencies = vi.mocked(findChangedDep);
const findChangedPackageFiles = vi.mocked(findChangedPkg);
const getDependentStoryFiles = vi.mocked(getDepStoryFiles);
const accessMock = vi.mocked(access);
const createReadStreamMock = vi.mocked(createReadStream);
const readdirSyncMock = vi.mocked(readdirSync);
const readFileSyncMock = vi.mocked(readFileSync);
const statSyncMock = vi.mocked(statSync);

const env = { CHROMATIC_RETRIES: 2, CHROMATIC_OUTPUT_INTERVAL: 0 };
const log = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };
const http = { fetch: vi.fn() };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('validateFiles', () => {
  it('sets fileInfo on context', async () => {
    readdirSyncMock.mockReturnValue(['iframe.html', 'index.html'] as any);
    statSyncMock.mockReturnValue({ isDirectory: () => false, size: 42 } as any);

    const ctx = { env, log, http, sourceDir: '/static/' } as any;
    await validateFiles(ctx);

    expect(ctx.fileInfo).toEqual(
      expect.objectContaining({
        lengths: [
          { contentLength: 42, knownAs: 'iframe.html', pathname: 'iframe.html' },
          { contentLength: 42, knownAs: 'index.html', pathname: 'index.html' },
        ],
        paths: ['iframe.html', 'index.html'],
        total: 84,
      })
    );
  });

  it("throws when index.html doesn't exist", async () => {
    readdirSyncMock.mockReturnValue(['iframe.html'] as any);
    statSyncMock.mockReturnValue({ isDirectory: () => false, size: 42 } as any);

    const ctx = { env, log, http, sourceDir: '/static/' } as any;
    await expect(validateFiles(ctx)).rejects.toThrow('Invalid Storybook build at /static/');
  });

  it("throws when iframe.html doesn't exist", async () => {
    readdirSyncMock.mockReturnValue(['index.html'] as any);
    statSyncMock.mockReturnValue({ isDirectory: () => false, size: 42 } as any);

    const ctx = { env, log, http, sourceDir: '/static/' } as any;
    await expect(validateFiles(ctx)).rejects.toThrow('Invalid Storybook build at /static/');
  });

  describe('with buildLogFile', () => {
    it('retries using outputDir from build-storybook.log', async () => {
      readdirSyncMock.mockReturnValueOnce([]);
      readdirSyncMock.mockReturnValueOnce(['iframe.html', 'index.html'] as any);
      statSyncMock.mockReturnValue({ isDirectory: () => false, size: 42 } as any);
      readFileSyncMock.mockReturnValue('info => Output directory: /var/storybook-static');

      const ctx = {
        env,
        log,
        http,
        sourceDir: '/static/',
        buildLogFile: 'build-storybook.log',
        options: {},
        packageJson: {},
      } as any;
      await validateFiles(ctx);

      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Unexpected build directory'));
      expect(ctx.sourceDir).toBe('/var/storybook-static');
      expect(ctx.fileInfo).toEqual(
        expect.objectContaining({
          lengths: [
            { contentLength: 42, knownAs: 'iframe.html', pathname: 'iframe.html' },
            { contentLength: 42, knownAs: 'index.html', pathname: 'index.html' },
          ],
          paths: ['iframe.html', 'index.html'],
          total: 84,
        })
      );
    });
  });
});

describe('traceChangedFiles', () => {
  beforeEach(() => {
    findChangedDependencies.mockReset();
    findChangedPackageFiles.mockReset();
    getDependentStoryFiles.mockReset();
    accessMock.mockImplementation((path, callback) => Promise.resolve(callback(undefined)));
  });

  it('sets onlyStoryFiles on context', async () => {
    const deps = { 123: ['./example.stories.js'] };
    findChangedDependencies.mockResolvedValue([]);
    findChangedPackageFiles.mockResolvedValue([]);
    getDependentStoryFiles.mockResolvedValue(deps);

    const ctx = {
      env,
      log,
      http,
      options: {},
      sourceDir: '/static/',
      fileInfo: { statsPath: '/static/preview-stats.json' },
      git: { changedFiles: ['./example.js'] },
      turboSnap: {},
    } as any;
    await traceChangedFiles(ctx, {} as any);

    expect(ctx.onlyStoryFiles).toStrictEqual(Object.keys(deps));
  });

  it('escapes special characters on context', async () => {
    const deps = {
      './example-(new).stories.js': ['./example-(new).stories.js'],
      './example[[lang=language]].stories.js': ['./example[[lang=language]].stories.js'],
      '[./example/[account]/[id]/[unit]/language/example.stories.tsx]': [
        '[./example/[account]/[id]/[unit]/language/example.stories.tsx]',
      ],
    };
    findChangedDependencies.mockResolvedValue([]);
    findChangedPackageFiles.mockResolvedValue([]);
    getDependentStoryFiles.mockResolvedValue(deps);

    const ctx = {
      env,
      log,
      http,
      options: {},
      sourceDir: '/static/',
      fileInfo: { statsPath: '/static/preview-stats.json' },
      git: { changedFiles: ['./example.js'] },
      turboSnap: {},
    } as any;
    await traceChangedFiles(ctx, {} as any);

    expect(ctx.onlyStoryFiles).toStrictEqual([
      './example-\\(\\new\\)\\.stories.js',
      './example\\[\\[\\lang=language\\]\\]\\.stories.js',
      '\\[\\./example/\\[\\account\\]\\/\\[\\id\\]\\/\\[\\unit\\]\\/language/example.stories.tsx\\]\\',
    ]);
  });

  it('does not run package dependency analysis if there are no metadata changes', async () => {
    const deps = { 123: ['./example.stories.js'] };
    getDependentStoryFiles.mockResolvedValue(deps);

    const ctx = {
      env,
      log,
      http,
      options: {},
      sourceDir: '/static/',
      fileInfo: { statsPath: '/static/preview-stats.json' },
      git: { changedFiles: ['./example.js'] },
      turboSnap: {},
    } as any;
    await traceChangedFiles(ctx, {} as any);

    expect(ctx.onlyStoryFiles).toStrictEqual(Object.keys(deps));
    expect(findChangedDependencies).not.toHaveBeenCalled();
    expect(findChangedPackageFiles).not.toHaveBeenCalled();
  });

  it('bails on package.json changes if it fails to retrieve lockfile changes (fallback scenario)', async () => {
    findChangedDependencies.mockRejectedValue(new Error('no lockfile'));
    findChangedPackageFiles.mockResolvedValue(['./package.json']);

    const packageMetadataChanges = [{ changedFiles: ['./package.json'], commit: 'abcdef' }];
    const ctx = {
      env,
      log,
      http,
      options: {},
      sourceDir: '/static/',
      fileInfo: { statsPath: '/static/preview-stats.json' },
      git: { changedFiles: ['./example.js', './package.json'], packageMetadataChanges },
      turboSnap: {},
    } as any;
    await traceChangedFiles(ctx, {} as any);

    expect(ctx.turboSnap.bailReason).toEqual({ changedPackageFiles: ['./package.json'] });
    expect(findChangedPackageFiles).toHaveBeenCalledWith(packageMetadataChanges);
    expect(getDependentStoryFiles).not.toHaveBeenCalled();
  });

  it('throws an error if storybookBaseDir is incorrect', async () => {
    const deps = { 123: ['./example.stories.js'] };
    findChangedDependencies.mockResolvedValue([]);
    findChangedPackageFiles.mockResolvedValue([]);
    getDependentStoryFiles.mockResolvedValue(deps);
    accessMock.mockImplementation((path, callback) => Promise.resolve(callback(new Error())));

    const ctx = {
      env,
      log,
      http,
      options: { storybookBaseDir: '/wrong' },
      sourceDir: '/static/',
      fileInfo: { statsPath: '/static/preview-stats.json' },
      git: { changedFiles: ['./example.js'] },
      turboSnap: {},
    } as any;
    await expect(traceChangedFiles(ctx, {} as any)).rejects.toThrow();
    expect(ctx.exitCode).toBe(exitCodes.INVALID_OPTIONS);
  });

  it('continues story file tracing if no dependencies are changed in package.json (fallback scenario)', async () => {
    const deps = { 123: ['./example.stories.js'] };
    findChangedDependencies.mockRejectedValue(new Error('no lockfile'));
    findChangedPackageFiles.mockResolvedValue([]); // no dependency changes
    getDependentStoryFiles.mockResolvedValue(deps);

    const packageMetadataChanges = [{ changedFiles: ['./package.json'], commit: 'abcdef' }];
    const ctx = {
      env,
      log,
      http,
      options: {},
      sourceDir: '/static/',
      fileInfo: { statsPath: '/static/preview-stats.json' },
      git: { changedFiles: ['./example.js', './package.json'], packageMetadataChanges },
      turboSnap: {},
    } as any;
    await traceChangedFiles(ctx, {} as any);

    expect(ctx.turboSnap.bailReason).toBeUndefined();
    expect(ctx.onlyStoryFiles).toStrictEqual(Object.keys(deps));
    expect(findChangedPackageFiles).toHaveBeenCalledWith(packageMetadataChanges);
  });
});

describe('calculateFileHashes', () => {
  it('sets hashes on context.fileInfo', async () => {
    const fileInfo = {
      lengths: [
        { knownAs: 'iframe.html', contentLength: 42 },
        { knownAs: 'index.html', contentLength: 42 },
      ],
      paths: ['iframe.html', 'index.html'],
      total: 84,
    };
    const ctx = {
      env,
      log,
      http,
      sourceDir: '/static/',
      options: { fileHashing: true },
      fileInfo,
      announcedBuild: { id: '1' },
    } as any;

    await calculateFileHashes(ctx, {} as any);

    expect(ctx.fileInfo.hashes).toMatchObject({
      'iframe.html': 'hash',
      'index.html': 'hash',
    });
  });
});

describe('uploadStorybook', () => {
  it('retrieves the upload locations and uploads the files', async () => {
    const client = { runQuery: vi.fn() };
    client.runQuery.mockReturnValue({
      uploadBuild: {
        info: {
          sentinelUrls: [],
          targets: [
            {
              contentType: 'text/html',
              filePath: 'iframe.html',
              formAction: 'https://s3.amazonaws.com/presigned?iframe.html',
              formFields: {},
            },
            {
              contentType: 'text/html',
              filePath: 'index.html',
              formAction: 'https://s3.amazonaws.com/presigned?index.html',
              formFields: {},
            },
          ],
        },
        userErrors: [],
      },
    });

    createReadStreamMock.mockReturnValue({ pipe: vi.fn() } as any);
    http.fetch.mockReturnValue({ ok: true });

    const fileInfo = {
      lengths: [
        { knownAs: 'iframe.html', contentLength: 42 },
        { knownAs: 'index.html', contentLength: 42 },
      ],
      paths: ['iframe.html', 'index.html'],
      total: 84,
    };
    const ctx = {
      client,
      env,
      log,
      http,
      sourceDir: '/static/',
      options: {},
      fileInfo,
      announcedBuild: { id: '1' },
    } as any;
    await uploadStorybook(ctx, {} as any);

    expect(client.runQuery).toHaveBeenCalledWith(expect.stringMatching(/UploadBuildMutation/), {
      buildId: '1',
      files: [
        { contentHash: undefined, contentLength: 42, filePath: 'iframe.html' },
        { contentHash: undefined, contentLength: 42, filePath: 'index.html' },
      ],
    });
    expect(http.fetch).toHaveBeenCalledWith(
      'https://s3.amazonaws.com/presigned?iframe.html',
      expect.objectContaining({ body: expect.any(FormData), method: 'POST' }),
      { retries: 0 }
    );
    expect(http.fetch).toHaveBeenCalledWith(
      'https://s3.amazonaws.com/presigned?index.html',
      expect.objectContaining({ body: expect.any(FormData), method: 'POST' }),
      { retries: 0 }
    );
    expect(ctx.uploadedBytes).toBe(84);
    expect(ctx.uploadedFiles).toBe(2);
  });

  it('calls experimental_onTaskProgress with progress', async () => {
    const client = { runQuery: vi.fn() };
    client.runQuery.mockReturnValue({
      uploadBuild: {
        info: {
          sentinelUrls: [],
          targets: [
            {
              contentType: 'text/html',
              filePath: 'iframe.html',
              formAction: 'https://s3.amazonaws.com/presigned?iframe.html',
              formFields: {},
            },
            {
              contentType: 'text/html',
              filePath: 'index.html',
              formAction: 'https://s3.amazonaws.com/presigned?index.html',
              formFields: {},
            },
          ],
        },
        userErrors: [],
      },
    });

    createReadStreamMock.mockReturnValue({ pipe: vi.fn((x) => x) } as any);
    http.fetch.mockReturnValue({ ok: true });

    const fileInfo = {
      lengths: [
        { knownAs: 'iframe.html', contentLength: 42 },
        { knownAs: 'index.html', contentLength: 42 },
      ],
      paths: ['iframe.html', 'index.html'],
      total: 84,
    };
    const ctx = {
      client,
      env,
      log,
      http,
      sourceDir: '/static/',
      options: { experimental_onTaskProgress: vi.fn() },
      fileInfo,
      announcedBuild: { id: '1' },
    } as any;
    await uploadStorybook(ctx, {} as any);

    expect(ctx.options.experimental_onTaskProgress).toHaveBeenCalledTimes(4);
    expect(ctx.options.experimental_onTaskProgress).toHaveBeenCalledWith(expect.any(Object), {
      progress: 21,
      total: 84,
      unit: 'bytes',
    });
    expect(ctx.options.experimental_onTaskProgress).toHaveBeenCalledWith(expect.any(Object), {
      progress: 42,
      total: 84,
      unit: 'bytes',
    });
    expect(ctx.options.experimental_onTaskProgress).toHaveBeenCalledWith(expect.any(Object), {
      progress: 63,
      total: 84,
      unit: 'bytes',
    });
    expect(ctx.options.experimental_onTaskProgress).toHaveBeenCalledWith(expect.any(Object), {
      progress: 84,
      total: 84,
      unit: 'bytes',
    });
  });

  it('batches calls to uploadBuild mutation', async () => {
    const client = { runQuery: vi.fn() };
    client.runQuery.mockReturnValueOnce({
      uploadBuild: {
        info: {
          sentinelUrls: [],
          targets: Array.from({ length: 1000 }, (_, i) => ({
            contentType: 'application/javascript',
            filePath: `${i}.js`,
            formAction: `https://s3.amazonaws.com/presigned?${i}.js`,
            formFields: {},
          })),
        },
        userErrors: [],
      },
    });
    client.runQuery.mockReturnValueOnce({
      uploadBuild: {
        info: {
          sentinelUrls: [],
          targets: [
            {
              contentType: 'application/javascript',
              filePath: `1000.js`,
              formAction: `https://s3.amazonaws.com/presigned?1000.js`,
              formFields: {},
            },
          ],
        },
        userErrors: [],
      },
    });

    createReadStreamMock.mockReturnValue({ pipe: vi.fn((x) => x) } as any);
    http.fetch.mockReturnValue({ ok: true });

    const fileInfo = {
      lengths: Array.from({ length: 1001 }, (_, i) => ({ knownAs: `${i}.js`, contentLength: i })),
      paths: Array.from({ length: 1001 }, (_, i) => `${i}.js`),
      total: Array.from({ length: 1001 }, (_, i) => i).reduce((a, v) => a + v),
    };
    const ctx = {
      client,
      env,
      log,
      http,
      sourceDir: '/static/',
      options: {},
      fileInfo,
      announcedBuild: { id: '1' },
    } as any;
    await uploadStorybook(ctx, {} as any);

    expect(client.runQuery).toHaveBeenCalledTimes(2);
    expect(client.runQuery).toHaveBeenCalledWith(expect.stringMatching(/UploadBuildMutation/), {
      buildId: '1',
      files: Array.from({ length: 1000 }, (_, i) => ({
        contentHash: undefined,
        contentLength: i,
        filePath: `${i}.js`,
      })),
    });
    expect(client.runQuery).toHaveBeenCalledWith(expect.stringMatching(/UploadBuildMutation/), {
      buildId: '1',
      files: [{ contentHash: undefined, contentLength: 1000, filePath: `1000.js` }], // 0-based index makes this file #1001
    });

    expect(http.fetch).toHaveBeenCalledWith(
      'https://s3.amazonaws.com/presigned?0.js',
      expect.objectContaining({ body: expect.any(FormData), method: 'POST' }),
      expect.objectContaining({ retries: 0 })
    );
    expect(http.fetch).toHaveBeenCalledWith(
      'https://s3.amazonaws.com/presigned?1.js',
      expect.objectContaining({ body: expect.any(FormData), method: 'POST' }),
      expect.objectContaining({ retries: 0 })
    );
    expect(http.fetch).toHaveBeenCalledWith(
      'https://s3.amazonaws.com/presigned?999.js',
      expect.objectContaining({ body: expect.any(FormData), method: 'POST' }),
      expect.objectContaining({ retries: 0 })
    );
    expect(http.fetch).toHaveBeenCalledWith(
      'https://s3.amazonaws.com/presigned?1000.js',
      expect.objectContaining({ body: expect.any(FormData), method: 'POST' }),
      expect.objectContaining({ retries: 0 })
    );
    expect(ctx.uploadedBytes).toBe(500500);
    expect(ctx.uploadedFiles).toBe(1001);
  });

  describe('with file hashes', () => {
    it('retrieves file upload locations and uploads only returned targets', async () => {
      const client = { runQuery: vi.fn() };
      client.runQuery.mockReturnValue({
        uploadBuild: {
          info: {
            sentinelUrls: [],
            targets: [
              {
                contentType: 'text/html',
                filePath: 'index.html',
                formAction: 'https://s3.amazonaws.com/presigned?index.html',
                formFields: {},
              },
            ],
          },
          userErrors: [],
        },
      });

      createReadStreamMock.mockReturnValue({ pipe: vi.fn() } as any);
      http.fetch.mockReturnValue({ ok: true });

      const fileInfo = {
        lengths: [
          { knownAs: 'iframe.html', contentLength: 42 },
          { knownAs: 'index.html', contentLength: 42 },
        ],
        hashes: { 'iframe.html': 'iframe', 'index.html': 'index' },
        paths: ['iframe.html', 'index.html'],
        total: 84,
      };
      const ctx = {
        client,
        env,
        log,
        http,
        sourceDir: '/static/',
        options: { zip: false },
        fileInfo,
        announcedBuild: { id: '1' },
      } as any;
      await uploadStorybook(ctx, {} as any);

      expect(client.runQuery).toHaveBeenCalledWith(expect.stringMatching(/UploadBuildMutation/), {
        buildId: '1',
        files: [
          { contentHash: 'iframe', contentLength: 42, filePath: 'iframe.html' },
          { contentHash: 'index', contentLength: 42, filePath: 'index.html' },
        ],
        zip: false,
      });
      expect(http.fetch).not.toHaveBeenCalledWith(
        'https://s3.amazonaws.com/presigned?iframe.html',
        expect.anything(),
        expect.anything()
      );
      expect(http.fetch).toHaveBeenCalledWith(
        'https://s3.amazonaws.com/presigned?index.html',
        expect.objectContaining({ body: expect.any(FormData), method: 'POST' }),
        { retries: 0 }
      );
      expect(ctx.uploadedBytes).toBe(42);
      expect(ctx.uploadedFiles).toBe(1);
    });
  });

  describe('with zip', () => {
    it('retrieves the upload location, adds the files to an archive and uploads it', async () => {
      const client = { runQuery: vi.fn() };
      client.runQuery.mockReturnValue({
        uploadBuild: {
          info: {
            sentinelUrls: ['https://asdqwe.chromatic.com/sentinel.txt'],
            targets: [
              {
                contentType: 'text/html',
                filePath: 'iframe.html',
                formAction: 'https://s3.amazonaws.com/presigned?iframe.html',
                formFields: {},
              },
              {
                contentType: 'text/html',
                filePath: 'index.html',
                formAction: 'https://s3.amazonaws.com/presigned?index.html',
                formFields: {},
              },
            ],
            zipTarget: {
              contentType: 'application/zip',
              filePath: 'storybook.zip',
              formAction: 'https://s3.amazonaws.com/presigned?storybook.zip',
              formFields: {},
            },
          },
          userErrors: [],
        },
      });

      makeZipFile.mockReturnValue(Promise.resolve({ path: 'storybook.zip', size: 80 }));
      createReadStreamMock.mockReturnValue({ pipe: vi.fn() } as any);
      http.fetch.mockReturnValue({ ok: true, text: () => Promise.resolve('OK') });

      const fileInfo = {
        lengths: [
          { knownAs: 'iframe.html', contentLength: 42 },
          { knownAs: 'index.html', contentLength: 42 },
        ],
        paths: ['iframe.html', 'index.html'],
        total: 84,
      };
      const ctx = {
        client,
        env,
        log,
        http,
        sourceDir: '/static/',
        options: { zip: true },
        fileInfo,
        announcedBuild: { id: '1' },
      } as any;
      await uploadStorybook(ctx, {} as any);

      expect(client.runQuery).toHaveBeenCalledWith(expect.stringMatching(/UploadBuildMutation/), {
        buildId: '1',
        files: [
          { contentHash: undefined, contentLength: 42, filePath: 'iframe.html' },
          { contentHash: undefined, contentLength: 42, filePath: 'index.html' },
        ],
        zip: true,
      });
      expect(http.fetch).toHaveBeenCalledWith(
        'https://s3.amazonaws.com/presigned?storybook.zip',
        expect.objectContaining({ body: expect.any(FormData), method: 'POST' }),
        { retries: 0 }
      );
      expect(http.fetch).not.toHaveBeenCalledWith(
        'https://s3.amazonaws.com/presigned?iframe.html',
        expect.anything(),
        expect.anything()
      );
      expect(http.fetch).not.toHaveBeenCalledWith(
        'https://s3.amazonaws.com/presigned?iframe.html',
        expect.anything(),
        expect.anything()
      );
      expect(ctx.uploadedBytes).toBe(80);
      expect(ctx.uploadedFiles).toBe(2);
    });

    it('handles zipTarget being undefined', async () => {
      const client = { runQuery: vi.fn() };
      client.runQuery.mockReturnValueOnce({
        uploadBuild: {
          info: {
            sentinelUrls: [],
            targets: Array.from({ length: 1000 }, (_, i) => ({
              contentType: 'application/javascript',
              filePath: `${i}.js`,
              formAction: `https://s3.amazonaws.com/presigned?${i}.js`,
              formFields: {},
            })),
            zipTarget: {
              contentType: 'application/zip',
              filePath: 'storybook.zip',
              formAction: 'https://s3.amazonaws.com/presigned?storybook.zip',
              formFields: {},
            },
          },
          userErrors: [],
        },
      });
      client.runQuery.mockReturnValueOnce({
        uploadBuild: {
          info: {
            sentinelUrls: [],
            targets: [
              {
                contentType: 'application/javascript',
                filePath: `1000.js`,
                formAction: `https://s3.amazonaws.com/presigned?1000.js`,
                formFields: {},
              },
            ],
            zipTarget: undefined,
          },
          userErrors: [],
        },
      });

      makeZipFile.mockReturnValue(Promise.resolve({ path: 'storybook.zip', size: 80 }));
      createReadStreamMock.mockReturnValue({ pipe: vi.fn() } as any);
      http.fetch.mockReturnValue({ ok: true, text: () => Promise.resolve('OK') });

      const fileInfo = {
        lengths: Array.from({ length: 1001 }, (_, i) => ({ knownAs: `${i}.js`, contentLength: i })),
        paths: Array.from({ length: 1001 }, (_, i) => `${i}.js`),
        total: Array.from({ length: 1001 }, (_, i) => i).reduce((a, v) => a + v),
      };
      const ctx = {
        client,
        env,
        log,
        http,
        sourceDir: '/static/',
        options: { zip: true },
        fileInfo,
        announcedBuild: { id: '1' },
      } as any;
      await uploadStorybook(ctx, {} as any);

      expect(http.fetch).toHaveBeenCalledWith(
        'https://s3.amazonaws.com/presigned?storybook.zip',
        expect.objectContaining({ body: expect.any(FormData), method: 'POST' }),
        { retries: 0 }
      );
      expect(http.fetch).not.toHaveBeenCalledWith(
        'https://s3.amazonaws.com/presigned?0.js',
        expect.anything(),
        expect.anything()
      );
      expect(http.fetch).not.toHaveBeenCalledWith(
        'https://s3.amazonaws.com/presigned?1000.js',
        expect.anything(),
        expect.anything()
      );
    });
  });
});

describe('waitForSentinels', () => {
  it('dedupes sentinel URLs before awaiting them', async () => {
    const client = { runQuery: vi.fn() };
    http.fetch.mockReturnValue({ ok: true, text: () => Promise.resolve('OK') });

    const sentinelUrls = [
      'https://chromatic-builds.s3.us-west-2.amazonaws.com/59c59bd0183bd100364e1d57-pbxunskvpo/.chromatic/files-copied.txt?foo',
      'https://chromatic-builds.s3.us-west-2.amazonaws.com/59c59bd0183bd100364e1d57-pbxunskvpo/.chromatic/zip-unpacked.txt?bar',
      'https://chromatic-builds.s3.us-west-2.amazonaws.com/59c59bd0183bd100364e1d57-pbxunskvpo/.chromatic/zip-unpacked.txt?baz',
      'https://chromatic-builds.s3.us-west-2.amazonaws.com/59c59bd0183bd100364e1d57-pbxunskvpo/.chromatic/files-copied.txt?baz',
    ];
    const ctx = {
      client,
      env,
      log,
      http,
      options: {},
      sentinelUrls,
    } as any;
    await waitForSentinels(ctx, {} as any);

    // Last one wins
    expect(http.fetch).not.toHaveBeenCalledWith(
      sentinelUrls[0],
      expect.any(Object),
      expect.any(Object)
    );
    expect(http.fetch).not.toHaveBeenCalledWith(
      sentinelUrls[1],
      expect.any(Object),
      expect.any(Object)
    );
    expect(http.fetch).toHaveBeenCalledWith(
      sentinelUrls[2],
      expect.any(Object),
      expect.any(Object)
    );
    expect(http.fetch).toHaveBeenCalledWith(
      sentinelUrls[3],
      expect.any(Object),
      expect.any(Object)
    );
  });
});
