import { traceChangedFiles as traceChangedFilesDep } from '@cli/turbosnap';
import AdmZip from 'adm-zip';
import { access } from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../../lib/testLogger';
import { calculateFileHashes, traceChangedFiles, validateAndroidArtifact } from './index';

vi.mock('adm-zip', () => ({ default: vi.fn() }));
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

vi.mock('../../lib/getFileHashes', () => ({
  getFileHashes: (files: string[]) =>
    Promise.resolve(Object.fromEntries(files.map((f) => [f, 'hash']))),
}));

const AdmZipMock = vi.mocked(AdmZip);
const traceChangedFilesTurbosnap = vi.mocked(traceChangedFilesDep);
const accessMock = vi.mocked(access);

const environment = { CHROMATIC_RETRIES: 2, CHROMATIC_OUTPUT_INTERVAL: 0 };
const log = new TestLogger();
const http = { fetch: vi.fn() };

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

const makeContext = (browsers: string[]) =>
  ({
    env: environment,
    log,
    http,
    sourceDir: '/static/',
    announcedBuild: { browsers },
  }) as any;

const mockEntries = (entryNames: string[]) => {
  const entries = entryNames.map((entryName) => ({ entryName }));
  AdmZipMock.mockImplementation(function (this: { getEntries: () => typeof entries }) {
    this.getEntries = () => entries;
  } as any);
};

describe('validateAndroidArtifact', () => {
  it('skips when android is not in browsers', async () => {
    const ctx = makeContext(['ios']);
    await expect(validateAndroidArtifact(ctx)).resolves.toBeUndefined();
    expect(AdmZipMock).not.toHaveBeenCalled();
  });

  it('passes when APK has no lib/ entries', async () => {
    mockEntries(['AndroidManifest.xml', 'classes.dex']);
    await expect(validateAndroidArtifact(makeContext(['android']))).resolves.toBeUndefined();
  });

  it('passes when APK has only lib/x86_64/ entries', async () => {
    mockEntries(['lib/x86_64/libnative.so']);
    await expect(validateAndroidArtifact(makeContext(['android']))).resolves.toBeUndefined();
  });

  it('passes when APK has lib/x86_64/ alongside other ABIs', async () => {
    mockEntries(['lib/x86_64/libnative.so', 'lib/arm64-v8a/libnative.so']);
    await expect(validateAndroidArtifact(makeContext(['android']))).resolves.toBeUndefined();
  });

  it('throws when APK has only ARM ABI entries', async () => {
    mockEntries(['lib/armeabi-v7a/libnative.so']);
    await expect(validateAndroidArtifact(makeContext(['android']))).rejects.toThrow(
      'Your storybook.apk contains native libraries but does not include x86_64 support. Chromatic only supports x86_64.'
    );
  });

  it('throws when APK has multiple ARM ABIs but no x86_64', async () => {
    mockEntries(['lib/armeabi-v7a/libnative.so', 'lib/arm64-v8a/libnative.so']);
    await expect(validateAndroidArtifact(makeContext(['android']))).rejects.toThrow(
      'Your storybook.apk contains native libraries but does not include x86_64 support. Chromatic only supports x86_64.'
    );
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
