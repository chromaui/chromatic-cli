import { readdirSync, readFileSync, statSync } from 'fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../../lib/testLogger';
import {
  isValidReactNativeStorybook,
  isValidStorybook,
  validateFiles,
  ValidateFilesInput,
} from './validateFiles';

vi.mock('fs');

const readdirSyncMock = vi.mocked(readdirSync);
const readFileSyncMock = vi.mocked(readFileSync);
const statSyncMock = vi.mocked(statSync);

const log = new TestLogger();

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

const makeDeps = () => ({
  log,
  options: {} as any,
  packageJson: {} as any,
});

const makeInput = (overrides: Partial<ValidateFilesInput> = {}): ValidateFilesInput => ({
  browsers: [],
  isReactNativeApp: false,
  sourceDir: '/static/',
  validator: () => ({ valid: true, missingFiles: [] }),
  validationErrorBuilder: () => new Error('invalid build'),
  getFileInfoErrorBuilder: (err) => err,
  ...overrides,
});

describe('validateFiles', () => {
  it('returns fileInfo and sourceDir for the source directory', async () => {
    readdirSyncMock.mockReturnValue(['iframe.html', 'index.html'] as any);
    statSyncMock.mockReturnValue({ isDirectory: () => false, size: 42 } as any);

    const result = await validateFiles(makeDeps(), makeInput({ sourceDir: '/static/' }));

    expect(result.sourceDir).toBe('/static/');
    expect(result.fileInfo).toEqual(
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

  it('does not include the .chromatic directory in the file list', async () => {
    readdirSyncMock.mockImplementation((path) => {
      if (path === '.chromatic') return ['zip-unpacked.txt'] as any;
      return ['iframe.html', 'index.html', '.chromatic'] as any;
    });
    statSyncMock.mockImplementation((path) => {
      if (path === '.chromatic') return { isDirectory: () => true, size: 42 } as any;
      return { isDirectory: () => false, size: 42 } as any;
    });

    const { fileInfo } = await validateFiles(makeDeps(), makeInput({ sourceDir: '.' }));

    expect(fileInfo).toEqual(
      expect.objectContaining({
        paths: ['iframe.html', 'index.html'],
        total: 84,
      })
    );
  });

  it('passes the scanned fileInfo and browsers to the validator', async () => {
    readdirSyncMock.mockReturnValue(['file'] as any);
    statSyncMock.mockReturnValue({ isDirectory: () => false, size: 1 } as any);

    const validator = vi.fn().mockReturnValue({ valid: true, missingFiles: [] });
    await validateFiles(makeDeps(), makeInput({ browsers: ['android', 'ios'], validator }));

    expect(validator).toHaveBeenCalledWith(expect.objectContaining({ paths: ['file'], total: 1 }), [
      'android',
      'ios',
    ]);
  });

  it('throws via validationErrorBuilder with missing files when the validator returns invalid', async () => {
    readdirSyncMock.mockReturnValue(['iframe.html'] as any);
    statSyncMock.mockReturnValue({ isDirectory: () => false, size: 42 } as any);

    const validationErrorBuilder = vi.fn((missing) => new Error(`missing: ${missing?.join(',')}`));
    const validator = vi.fn().mockReturnValue({ valid: false, missingFiles: ['index.html'] });

    await expect(
      validateFiles(makeDeps(), makeInput({ validator, validationErrorBuilder }))
    ).rejects.toThrow('missing: index.html');
    expect(validationErrorBuilder).toHaveBeenCalledWith(['index.html']);
  });

  it('throws via getFileInfoErrorBuilder when the source directory cannot be scanned', async () => {
    const scanError = new Error('ENOENT');
    readdirSyncMock.mockImplementation(() => {
      throw scanError;
    });

    const getFileInfoErrorBuilder = vi.fn((err) => new Error(`wrapped: ${err.message}`));

    await expect(validateFiles(makeDeps(), makeInput({ getFileInfoErrorBuilder }))).rejects.toThrow(
      'wrapped: ENOENT'
    );
    expect(getFileInfoErrorBuilder).toHaveBeenCalledWith(scanError);
  });

  describe('with buildLogFile', () => {
    it('returns the corrected sourceDir from build-storybook.log when initial validation fails', async () => {
      readdirSyncMock.mockReturnValueOnce([] as any);
      readdirSyncMock.mockReturnValueOnce(['iframe.html', 'index.html'] as any);
      statSyncMock.mockReturnValue({ isDirectory: () => false, size: 42 } as any);
      readFileSyncMock.mockReturnValue('info => Output directory: /var/storybook-static');

      const validator = vi
        .fn()
        .mockReturnValueOnce({ valid: false, missingFiles: ['iframe.html', 'index.html'] })
        .mockReturnValue({ valid: true, missingFiles: [] });
      const input = makeInput({
        sourceDir: '/static/',
        buildLogFile: 'build-storybook.log',
        validator,
      });

      const result = await validateFiles(makeDeps(), input);

      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Unexpected build directory'));
      expect(result.sourceDir).toBe('/var/storybook-static');
      expect(result.fileInfo).toEqual(
        expect.objectContaining({
          paths: ['iframe.html', 'index.html'],
          total: 84,
        })
      );
    });

    it('returns the original sourceDir when no override happens', async () => {
      readdirSyncMock.mockReturnValue(['iframe.html', 'index.html'] as any);
      statSyncMock.mockReturnValue({ isDirectory: () => false, size: 42 } as any);

      const result = await validateFiles(makeDeps(), makeInput({ sourceDir: '/static/' }));

      expect(result.sourceDir).toBe('/static/');
    });

    it('throws via validationErrorBuilder when retried validation still fails', async () => {
      readdirSyncMock.mockReturnValue([] as any);
      readFileSyncMock.mockReturnValue('info => Output directory: /var/storybook-static');

      const validator = vi.fn().mockReturnValue({ valid: false, missingFiles: ['index.html'] });
      const validationErrorBuilder = vi.fn(() => new Error('still invalid'));

      await expect(
        validateFiles(
          makeDeps(),
          makeInput({
            buildLogFile: 'build-storybook.log',
            validator,
            validationErrorBuilder,
          })
        )
      ).rejects.toThrow('still invalid');
    });

    it('does not retry when the build log has no output directory', async () => {
      readdirSyncMock.mockReturnValue([] as any);
      readFileSyncMock.mockReturnValue('no output info in this log');

      const validator = vi.fn().mockReturnValue({ valid: false, missingFiles: [] });

      await expect(
        validateFiles(
          makeDeps(),
          makeInput({
            sourceDir: '/static/',
            buildLogFile: 'build-storybook.log',
            validator,
            validationErrorBuilder: () => new Error('invalid'),
          })
        )
      ).rejects.toThrow('invalid');
      expect(readdirSyncMock).toHaveBeenCalledTimes(1);
    });

    it('does not retry when the build log output directory matches the source directory', async () => {
      readdirSyncMock.mockReturnValue([] as any);
      readFileSyncMock.mockReturnValue('info => Output directory: /static/');

      const validator = vi.fn().mockReturnValue({ valid: false, missingFiles: [] });

      await expect(
        validateFiles(
          makeDeps(),
          makeInput({
            sourceDir: '/static/',
            buildLogFile: 'build-storybook.log',
            validator,
            validationErrorBuilder: () => new Error('invalid'),
          })
        )
      ).rejects.toThrow('invalid');
      expect(readdirSyncMock).toHaveBeenCalledTimes(1);
    });

    it('swallows build log read errors and falls back to the validation error', async () => {
      readdirSyncMock.mockReturnValue([] as any);
      readFileSyncMock.mockImplementation(() => {
        throw new Error('build log not found');
      });

      const validator = vi.fn().mockReturnValue({ valid: false, missingFiles: [] });

      await expect(
        validateFiles(
          makeDeps(),
          makeInput({
            buildLogFile: 'build-storybook.log',
            validator,
            validationErrorBuilder: () => new Error('invalid'),
          })
        )
      ).rejects.toThrow('invalid');
      expect(log.debug).toHaveBeenCalled();
    });
  });
});

describe('isValidStorybook', () => {
  it('is valid when iframe.html and index.html are present with non-zero total', () => {
    expect(isValidStorybook({ paths: ['iframe.html', 'index.html'], total: 84 })).toEqual({
      valid: true,
      missingFiles: [],
    });
  });

  it('reports iframe.html missing when only index.html is present', () => {
    expect(isValidStorybook({ paths: ['index.html'], total: 42 })).toEqual({
      valid: false,
      missingFiles: ['iframe.html'],
    });
  });

  it('reports index.html missing when only iframe.html is present', () => {
    expect(isValidStorybook({ paths: ['iframe.html'], total: 42 })).toEqual({
      valid: false,
      missingFiles: ['index.html'],
    });
  });

  it('is invalid when total size is 0 even with required files present', () => {
    expect(isValidStorybook({ paths: ['iframe.html', 'index.html'], total: 0 })).toMatchObject({
      valid: false,
    });
  });
});

describe('isValidReactNativeStorybook', () => {
  it('is invalid when no browsers are configured', () => {
    expect(
      isValidReactNativeStorybook({ paths: ['storybook.apk', 'manifest.json'], total: 84 }, [])
    ).toEqual({ valid: false, missingFiles: [] });
  });

  it('defaults browsers to an empty list when omitted', () => {
    expect(
      isValidReactNativeStorybook({ paths: ['storybook.apk', 'manifest.json'], total: 84 })
    ).toEqual({ valid: false, missingFiles: [] });
  });

  describe('Android', () => {
    it('is valid with manifest.json and storybook.apk', () => {
      expect(
        isValidReactNativeStorybook({ paths: ['storybook.apk', 'manifest.json'], total: 84 }, [
          'android',
        ])
      ).toEqual({ valid: true, missingFiles: [] });
    });

    it('reports missing storybook.apk', () => {
      expect(
        isValidReactNativeStorybook({ paths: ['manifest.json'], total: 42 }, ['android'])
      ).toEqual({ valid: false, missingFiles: ['storybook.apk'] });
    });

    it('reports missing manifest.json', () => {
      expect(
        isValidReactNativeStorybook({ paths: ['storybook.apk'], total: 42 }, ['android'])
      ).toEqual({ valid: false, missingFiles: ['manifest.json'] });
    });
  });

  describe('iOS', () => {
    it('is valid with manifest.json and a storybook.app/* path', () => {
      expect(
        isValidReactNativeStorybook(
          { paths: ['storybook.app/modules.json', 'manifest.json'], total: 84 },
          ['ios']
        )
      ).toEqual({ valid: true, missingFiles: [] });
    });

    it('reports missing storybook.app when no path starts with storybook.app/', () => {
      expect(isValidReactNativeStorybook({ paths: ['manifest.json'], total: 42 }, ['ios'])).toEqual(
        { valid: false, missingFiles: ['storybook.app'] }
      );
    });

    it('reports missing manifest.json', () => {
      expect(
        isValidReactNativeStorybook({ paths: ['storybook.app/modules.json'], total: 42 }, ['ios'])
      ).toEqual({ valid: false, missingFiles: ['manifest.json'] });
    });
  });

  describe('Android and iOS', () => {
    it('is valid with manifest.json, storybook.apk, and a storybook.app/* path', () => {
      expect(
        isValidReactNativeStorybook(
          {
            paths: ['storybook.apk', 'storybook.app/modules.json', 'manifest.json'],
            total: 126,
          },
          ['android', 'ios']
        )
      ).toEqual({ valid: true, missingFiles: [] });
    });

    it('reports both storybook.apk and storybook.app as missing', () => {
      expect(
        isValidReactNativeStorybook({ paths: ['manifest.json'], total: 42 }, ['android', 'ios'])
      ).toEqual({ valid: false, missingFiles: ['storybook.apk', 'storybook.app'] });
    });
  });

  it('is invalid when total size is 0 even with required files present', () => {
    expect(
      isValidReactNativeStorybook({ paths: ['storybook.apk', 'manifest.json'], total: 0 }, [
        'android',
      ])
    ).toMatchObject({ valid: false });
  });
});
