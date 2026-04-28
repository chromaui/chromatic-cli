import { afterEach, describe, expect, it, vi } from 'vitest';

import { createInMemoryChromaticApi } from '../../lib/ports/chromaticApiInMemoryAdapter';
import { createInMemoryUploader } from '../../lib/ports/uploaderInMemoryAdapter';
import TestLogger from '../../lib/testLogger';
import type { Options } from '../../types';
import { runUploadPhase } from './upload';

const baseEnvironment = { CHROMATIC_OUTPUT_INTERVAL: 0 };

const baseFileInfo = {
  paths: ['iframe.html', 'index.html'],
  statsPath: '',
  lengths: [
    { pathname: 'iframe.html', knownAs: 'iframe.html', contentLength: 42 },
    { pathname: 'index.html', knownAs: 'index.html', contentLength: 42 },
  ],
  total: 84,
};

const baseAnnounced = {
  id: 'build-id',
  number: 1,
  browsers: ['chrome'],
  status: 'ANNOUNCED',
  autoAcceptChanges: false,
  reportToken: 'token',
  app: { id: 'a', turboSnapAvailability: 'AVAILABLE' },
} as any;

function makePorts(args: { chromaticState?: any; uploaderState?: any; fs?: any } = {}) {
  const uploaderState = args.uploaderState ?? { sentinelReady: new Set<string>() };
  return {
    chromatic: createInMemoryChromaticApi(args.chromaticState ?? {}),
    uploader: createInMemoryUploader(uploaderState),
    fs: args.fs ?? { exists: vi.fn(async () => true) },
  } as any;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('runUploadPhase', () => {
  it('uploads files and returns UploadedState totals + sentinel URLs', async () => {
    const log = new TestLogger();
    const ports = makePorts({
      chromaticState: {
        uploadBuild: {
          info: {
            sentinelUrls: ['https://sentinel.chromatic.com/path/sentinel'],
            targets: [
              {
                contentType: 'text/html',
                filePath: 'iframe.html',
                fileKey: 'iframe',
                formAction: 'https://s3/iframe',
                formFields: {},
              },
              {
                contentType: 'text/html',
                filePath: 'index.html',
                fileKey: 'index',
                formAction: 'https://s3/index',
                formFields: {},
              },
            ],
          },
          userErrors: [],
        },
      },
      uploaderState: {
        sentinelReady: new Set(['https://sentinel.chromatic.com/path/sentinel']),
      },
    });
    const result = await runUploadPhase({
      options: {} as Options,
      env: baseEnvironment,
      sourceDir: '/static',
      fileInfo: baseFileInfo,
      announcedBuild: baseAnnounced,
      log,
      ports,
    });
    expect(result.uploadedBytes).toBe(84);
    expect(result.uploadedFiles).toBe(2);
    expect(result.sentinelUrls).toEqual(['https://sentinel.chromatic.com/path/sentinel']);
  });

  it('dedupes sentinel URLs that share host + pathname', async () => {
    const log = new TestLogger();
    const ports = makePorts({
      chromaticState: {
        uploadBuild: {
          info: {
            sentinelUrls: [
              'https://sentinel.chromatic.com/path/sentinel?token=a',
              'https://sentinel.chromatic.com/path/sentinel?token=b',
            ],
            targets: [
              {
                contentType: 'text/html',
                filePath: 'iframe.html',
                fileKey: 'iframe',
                formAction: 'https://s3/iframe',
                formFields: {},
              },
              {
                contentType: 'text/html',
                filePath: 'index.html',
                fileKey: 'index',
                formAction: 'https://s3/index',
                formFields: {},
              },
            ],
          },
          userErrors: [],
        },
      },
      uploaderState: {
        sentinelReady: new Set([
          'https://sentinel.chromatic.com/path/sentinel?token=a',
          'https://sentinel.chromatic.com/path/sentinel?token=b',
        ]),
      },
    });
    const waitSpy = vi.spyOn(ports.uploader, 'waitForSentinel');
    const result = await runUploadPhase({
      options: {} as Options,
      env: baseEnvironment,
      sourceDir: '/static',
      fileInfo: baseFileInfo,
      announcedBuild: baseAnnounced,
      log,
      ports,
    });
    expect(result.sentinelUrls).toHaveLength(2);
    expect(waitSpy).toHaveBeenCalledTimes(1);
  });

  it('emits onProgress events with throttled total/progress', async () => {
    const log = new TestLogger();
    const ports = makePorts({
      chromaticState: {
        uploadBuild: {
          info: {
            sentinelUrls: [],
            targets: [
              {
                contentType: 'text/html',
                filePath: 'iframe.html',
                fileKey: 'i',
                formAction: 'https://s3/iframe',
                formFields: {},
              },
              {
                contentType: 'text/html',
                filePath: 'index.html',
                fileKey: 'j',
                formAction: 'https://s3/index',
                formFields: {},
              },
            ],
          },
          userErrors: [],
        },
      },
    });
    const events: { progress: number; total: number }[] = [];
    await runUploadPhase({
      options: {} as Options,
      env: baseEnvironment,
      sourceDir: '/static',
      fileInfo: baseFileInfo,
      announcedBuild: baseAnnounced,
      log,
      ports,
      onProgress: ({ progress, total }) => events.push({ progress, total }),
    });
    expect(events.at(-1)).toEqual({ progress: 84, total: 84 });
  });

  it('returns zero totals when there are no new files to upload', async () => {
    const log = new TestLogger();
    const ports = makePorts({
      chromaticState: {
        uploadBuild: {
          info: { sentinelUrls: [], targets: [] },
          userErrors: [],
        },
      },
    });
    const result = await runUploadPhase({
      options: {} as Options,
      env: baseEnvironment,
      sourceDir: '/static',
      fileInfo: baseFileInfo,
      announcedBuild: baseAnnounced,
      log,
      ports,
    });
    expect(result.uploadedBytes).toBe(0);
    expect(result.uploadedFiles).toBe(0);
    expect(result.sentinelUrls).toEqual([]);
  });

  it('filters bundle files by browser for React Native builds', async () => {
    const log = new TestLogger();
    const reactNativeFileInfo = {
      paths: ['manifest.json', 'storybook.apk', 'storybook.app/Info.plist', 'unrelated.txt'],
      statsPath: '',
      lengths: [
        { pathname: 'manifest.json', knownAs: 'manifest.json', contentLength: 10 },
        { pathname: 'storybook.apk', knownAs: 'storybook.apk', contentLength: 20 },
        {
          pathname: 'storybook.app/Info.plist',
          knownAs: 'storybook.app/Info.plist',
          contentLength: 30,
        },
        { pathname: 'unrelated.txt', knownAs: 'unrelated.txt', contentLength: 40 },
      ],
      total: 100,
    };
    const ports = makePorts({
      chromaticState: {
        uploadBuild: {
          info: {
            sentinelUrls: [],
            targets: [
              {
                contentType: 'application/json',
                filePath: 'manifest.json',
                fileKey: 'm',
                formAction: 'https://s3/m',
                formFields: {},
              },
              {
                contentType: 'application/vnd.android.package-archive',
                filePath: 'storybook.apk',
                fileKey: 'apk',
                formAction: 'https://s3/apk',
                formFields: {},
              },
            ],
          },
          userErrors: [],
        },
      },
    });
    const result = await runUploadPhase({
      options: {} as Options,
      env: baseEnvironment,
      sourceDir: '/static',
      fileInfo: reactNativeFileInfo,
      announcedBuild: { ...baseAnnounced, browsers: ['android'] },
      isReactNativeApp: true,
      log,
      ports,
    });
    expect(result.uploadedFiles).toBe(2);
    expect(result.uploadedBytes).toBe(30);
  });

  it('throws when a userError is reported by the chromatic API', async () => {
    const log = new TestLogger();
    const ports = makePorts({
      chromaticState: {
        uploadBuild: {
          info: { sentinelUrls: [], targets: [] },
          userErrors: [{ __typename: 'MaxFileCountExceededError', message: 'too many' }],
        },
      },
    });
    await expect(
      runUploadPhase({
        options: {} as Options,
        env: baseEnvironment,
        sourceDir: '/static',
        fileInfo: baseFileInfo,
        announcedBuild: baseAnnounced,
        log,
        ports,
      })
    ).rejects.toThrow();
  });
});
