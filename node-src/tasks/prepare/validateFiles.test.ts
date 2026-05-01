import { readdirSync, readFileSync, statSync } from 'fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../../lib/testLogger';
import { validateFiles } from './validateFiles';

vi.mock('fs');

const readdirSyncMock = vi.mocked(readdirSync);
const readFileSyncMock = vi.mocked(readFileSync);
const statSyncMock = vi.mocked(statSync);

const environment = { CHROMATIC_RETRIES: 2, CHROMATIC_OUTPUT_INTERVAL: 0 };
const log = new TestLogger();
const http = { fetch: vi.fn() };

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
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

    it('retries using multiline outputDir from build-storybook.log', async () => {
      readdirSyncMock.mockReturnValueOnce([]);
      readdirSyncMock.mockReturnValueOnce(['iframe.html', 'index.html'] as any);
      statSyncMock.mockReturnValue({ isDirectory: () => false, size: 42 } as any);
      readFileSyncMock.mockReturnValue(`\u001B[32m◇\u001B[39m  Output directory:
\u001B[90m│\u001B[39m  /var/storybook-static
\u001B[90m│\u001B[39m
\u001B[90m└\u001B[39m  Storybook build completed successfully
`);

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
    it('throws when no React Native browsers are configured', async () => {
      readdirSyncMock.mockReturnValue([
        'storybook.apk',
        'storybook.app/modules.json',
        'manifest.json',
      ] as any);
      statSyncMock.mockReturnValue({ isDirectory: () => false, size: 42 } as any);

      const ctx = {
        env: environment,
        log,
        http,
        options: {},
        sourceDir: '/static/',
        isReactNativeApp: true,
        announcedBuild: { browsers: [] },
      } as any;
      await expect(validateFiles(ctx)).rejects.toThrow(
        'Invalid React Native Storybook build in directory /static'
      );
    });

    describe('Android devices', () => {
      it('sets fileInfo on context with valid React Native build', async () => {
        readdirSyncMock.mockReturnValue(['storybook.apk', 'manifest.json'] as any);
        statSyncMock.mockReturnValue({ isDirectory: () => false, size: 42 } as any);

        const ctx = {
          env: environment,
          log,
          http,
          sourceDir: '/static/',
          isReactNativeApp: true,
          announcedBuild: { browsers: ['android'] },
        } as any;
        await validateFiles(ctx);

        expect(ctx.fileInfo).toEqual(
          expect.objectContaining({
            lengths: [
              { contentLength: 42, knownAs: 'storybook.apk', pathname: 'storybook.apk' },
              { contentLength: 42, knownAs: 'manifest.json', pathname: 'manifest.json' },
            ],
            paths: ['storybook.apk', 'manifest.json'],
            total: 84,
          })
        );
      });

      it("throws when manifest.json doesn't exist", async () => {
        readdirSyncMock.mockReturnValue(['storybook.apk'] as any);
        statSyncMock.mockReturnValue({ isDirectory: () => false, size: 42 } as any);

        const ctx = {
          env: environment,
          log,
          http,
          options: {},
          sourceDir: '/static/',
          isReactNativeApp: true,
          announcedBuild: { browsers: ['android'] },
        } as any;
        await expect(validateFiles(ctx)).rejects.toThrow(
          `Missing files:
  → manifest.json

Invalid React Native Storybook build in directory /static`
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
          announcedBuild: { browsers: ['android'] },
        } as any;
        await expect(validateFiles(ctx)).rejects.toThrow(
          `→ This build is missing the storybook.apk file required for React Native Storybook for Android.
  Please ensure that the file is present in the output directory and named correctly before running the CLI.

Invalid React Native Storybook build in directory /static`
        );
      });
    });

    describe('iOS devices', () => {
      it('sets fileInfo on context with valid React Native build', async () => {
        readdirSyncMock.mockReturnValue(['storybook.app/modules.json', 'manifest.json'] as any);
        statSyncMock.mockReturnValue({ isDirectory: () => false, size: 42 } as any);

        const ctx = {
          env: environment,
          log,
          http,
          sourceDir: '/static/',
          isReactNativeApp: true,
          announcedBuild: { browsers: ['ios'] },
        } as any;
        await validateFiles(ctx);

        expect(ctx.fileInfo).toEqual(
          expect.objectContaining({
            lengths: [
              {
                contentLength: 42,
                knownAs: 'storybook.app/modules.json',
                pathname: 'storybook.app/modules.json',
              },
              { contentLength: 42, knownAs: 'manifest.json', pathname: 'manifest.json' },
            ],
            paths: ['storybook.app/modules.json', 'manifest.json'],
            total: 84,
          })
        );
      });

      it("throws when manifest.json doesn't exist", async () => {
        readdirSyncMock.mockReturnValue(['storybook.app/modules.json'] as any);
        statSyncMock.mockReturnValue({ isDirectory: () => false, size: 42 } as any);

        const ctx = {
          env: environment,
          log,
          http,
          options: {},
          sourceDir: '/static/',
          isReactNativeApp: true,
          announcedBuild: { browsers: ['ios'] },
        } as any;
        await expect(validateFiles(ctx)).rejects.toThrow(
          `Missing files:
  → manifest.json

Invalid React Native Storybook build in directory /static`
        );
      });

      it("throws when the APP directory doesn't exist", async () => {
        readdirSyncMock.mockReturnValue(['manifest.json'] as any);
        statSyncMock.mockReturnValue({ isDirectory: () => false, size: 42 } as any);

        const ctx = {
          env: environment,
          log,
          http,
          options: {},
          sourceDir: '/static/',
          isReactNativeApp: true,
          announcedBuild: { browsers: ['ios'] },
        } as any;
        await expect(validateFiles(ctx)).rejects.toThrow(
          `→ This build is missing the storybook.app file required for React Native Storybook for iOS.
  Please ensure that the file is present in the output directory and named correctly before running the CLI.

Invalid React Native Storybook build in directory /static`
        );
      });
    });

    describe('Android and iOS devices', () => {
      it('throws when both native build files are missing', async () => {
        readdirSyncMock.mockReturnValue(['manifest.json'] as any);
        statSyncMock.mockReturnValue({ isDirectory: () => false, size: 42 } as any);

        const ctx = {
          env: environment,
          log,
          http,
          options: {},
          sourceDir: '/static/',
          isReactNativeApp: true,
          announcedBuild: { browsers: ['android', 'ios'] },
        } as any;
        await expect(validateFiles(ctx)).rejects.toThrow(
          `→ This build is missing the storybook.app (iOS) and storybook.apk (Android) files required for React Native Storybook.
  Please ensure that the files are present in the output directory and named correctly before running the CLI.

Invalid React Native Storybook build in directory /static`
        );
      });
    });
  });
});
