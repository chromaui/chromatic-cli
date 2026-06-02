import AdmZip from 'adm-zip';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../../lib/testLogger';
import { validateAndroidArtifact } from './validateAndroidArtifact';

vi.mock('adm-zip', () => ({ default: vi.fn() }));

const AdmZipMock = vi.mocked(AdmZip);

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
