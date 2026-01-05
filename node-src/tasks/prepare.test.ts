import { traceChangedFiles as traceChangedFilesDep } from '@cli/turbosnap';
import { access, readdirSync, readFileSync, statSync } from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../lib/testLogger';
import { calculateFileHashes, traceChangedFiles, validateFiles } from './prepare';

vi.mock('fs');
vi.mock('@cli/turbosnap');
vi.mock('./readStatsFile', () => ({
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

vi.mock('../lib/getFileHashes', () => ({
  getFileHashes: (files: string[]) =>
    Promise.resolve(Object.fromEntries(files.map((f) => [f, 'hash']))),
}));

const traceChangedFilesTurbosnap = vi.mocked(traceChangedFilesDep);
const accessMock = vi.mocked(access);
const readdirSyncMock = vi.mocked(readdirSync);
const readFileSyncMock = vi.mocked(readFileSync);
const statSyncMock = vi.mocked(statSync);

const environment = { CHROMATIC_RETRIES: 2, CHROMATIC_OUTPUT_INTERVAL: 0 };
const log = new TestLogger();
const http = { fetch: vi.fn() };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('validateFiles', () => {
  it('sets fileInfo on context', async () => {
    readdirSyncMock.mockReturnValue(['iframe.html', 'index.html'] as any);
    statSyncMock.mockReturnValue({ isDirectory: () => false, size: 42 } as any);

    const ctx = { env: environment, log, http, sourceDir: '/static/' } as any;
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

    const ctx = { env: environment, log, http, options: {}, sourceDir: '/static/' } as any;
    await expect(validateFiles(ctx)).rejects.toThrow('Invalid Storybook build at /static/');
  });

  it("throws when iframe.html doesn't exist", async () => {
    readdirSyncMock.mockReturnValue(['index.html'] as any);
    statSyncMock.mockReturnValue({ isDirectory: () => false, size: 42 } as any);

    const ctx = { env: environment, log, http, options: {}, sourceDir: '/static/' } as any;
    await expect(validateFiles(ctx)).rejects.toThrow('Invalid Storybook build at /static/');
  });

  it('does not include the .chromatic directory in the file list', async () => {
    readdirSyncMock.mockImplementation((path) => {
      if (path === '.chromatic') {
        return ['zip-unpacked.txt'] as any;
      }
      return ['iframe.html', 'index.html', '.chromatic'] as any;
    });
    statSyncMock.mockImplementation((path) => {
      if (path === '.chromatic') {
        return { isDirectory: () => true, size: 42 } as any;
      }
      return { isDirectory: () => false, size: 42 } as any;
    });

    const ctx = { env: environment, log, http, sourceDir: '.' } as any;
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

  describe('with buildLogFile', () => {
    it('retries using outputDir from build-storybook.log', async () => {
      readdirSyncMock.mockReturnValueOnce([]);
      readdirSyncMock.mockReturnValueOnce(['iframe.html', 'index.html'] as any);
      statSyncMock.mockReturnValue({ isDirectory: () => false, size: 42 } as any);
      readFileSyncMock.mockReturnValue('info => Output directory: /var/storybook-static');

      const ctx = {
        env: environment,
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

  describe('with isReactNativeApp', () => {
    it('sets fileInfo on context with valid React Native build', async () => {
      readdirSyncMock.mockReturnValue(['app.apk', 'manifest.json'] as any);
      statSyncMock.mockReturnValue({ isDirectory: () => false, size: 42 } as any);

      const ctx = {
        env: environment,
        log,
        http,
        sourceDir: '/static/',
        isReactNativeApp: true,
      } as any;
      await validateFiles(ctx);

      expect(ctx.fileInfo).toEqual(
        expect.objectContaining({
          lengths: [
            { contentLength: 42, knownAs: 'app.apk', pathname: 'app.apk' },
            { contentLength: 42, knownAs: 'manifest.json', pathname: 'manifest.json' },
          ],
          paths: ['app.apk', 'manifest.json'],
          total: 84,
        })
      );
    });

    it("throws when manifest.json doesn't exist", async () => {
      readdirSyncMock.mockReturnValue(['app.apk'] as any);
      statSyncMock.mockReturnValue({ isDirectory: () => false, size: 42 } as any);

      const ctx = {
        env: environment,
        log,
        http,
        options: {},
        sourceDir: '/static/',
        isReactNativeApp: true,
      } as any;
      await expect(validateFiles(ctx)).rejects.toThrow(
        'Invalid React Native Storybook build at /static/'
      );
    });

    it("throws when APK doesn't exist", async () => {
      readdirSyncMock.mockReturnValue(['manifest.json'] as any);
      statSyncMock.mockReturnValue({ isDirectory: () => false, size: 42 } as any);

      const ctx = {
        env: environment,
        log,
        http,
        options: {},
        sourceDir: '/static/',
        isReactNativeApp: true,
      } as any;
      await expect(validateFiles(ctx)).rejects.toThrow(
        'Invalid React Native Storybook build at /static/'
      );
    });
  });
});

describe('traceChangedFiles', () => {
  beforeEach(() => {
    accessMock.mockImplementation((_path, callback) => Promise.resolve(callback(null)));
  });

  it('sets onlyStoryFiles on context', async () => {
    const deps = { 123: ['./example.stories.js'] };
    traceChangedFilesTurbosnap.mockResolvedValue(deps);

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
    await traceChangedFiles(ctx, {} as any);

    expect(ctx.onlyStoryFiles).toStrictEqual(Object.keys(deps));
  });

  it('escapes special characters on context', async () => {
    const deps = {
      './$example-new.stories.js': ['./$example-new.stories.js'],
      './+example-new.stories.js': ['./+example-new.stories.js'],
      './example-(new).stories.js': ['./example-(new).stories.js'],
      './example[[lang=language]].stories.js': ['./example[[lang=language]].stories.js'],
      '[./example/[account]/[id]/[unit]/language/example.stories.tsx]': [
        '[./example/[account]/[id]/[unit]/language/example.stories.tsx]',
      ],
    };
    traceChangedFilesTurbosnap.mockResolvedValue(deps);

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
    await traceChangedFiles(ctx, {} as any);

    expect(ctx.onlyStoryFiles).toStrictEqual([
      String.raw`./\$example-new.stories.js`,
      String.raw`./\+example-new.stories.js`,
      String.raw`./example-\(new\).stories.js`,
      String.raw`./example\[\[lang=language\]\].stories.js`,
      String.raw`\[./example/\[account\]/\[id\]/\[unit\]/language/example.stories.tsx\]`,
    ]);
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
      env: environment,
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
