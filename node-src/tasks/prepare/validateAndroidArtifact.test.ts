import AdmZip from 'adm-zip';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { validateAndroidArtifact } from './validateAndroidArtifact';

vi.mock('adm-zip', () => ({ default: vi.fn() }));

const AdmZipMock = vi.mocked(AdmZip);

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

const input = (browsers: string[]) => ({ sourceDir: '/static/', browsers });

const mockEntries = (entryNames: string[]) => {
  const entries = entryNames.map((entryName) => ({ entryName }));
  AdmZipMock.mockImplementation(function (this: { getEntries: () => typeof entries }) {
    this.getEntries = () => entries;
  } as any);
};

describe('validateAndroidArtifact', () => {
  it('skips when android is not in browsers', async () => {
    await expect(validateAndroidArtifact(input(['ios']))).resolves.toBeUndefined();
    expect(AdmZipMock).not.toHaveBeenCalled();
  });

  it('passes when APK has no lib/ entries', async () => {
    mockEntries(['AndroidManifest.xml', 'classes.dex']);
    await expect(validateAndroidArtifact(input(['android']))).resolves.toBeUndefined();
  });

  it('passes when APK has only lib/x86_64/ entries', async () => {
    mockEntries(['lib/x86_64/libnative.so']);
    await expect(validateAndroidArtifact(input(['android']))).resolves.toBeUndefined();
  });

  it('passes when APK has lib/x86_64/ alongside other ABIs', async () => {
    mockEntries(['lib/x86_64/libnative.so', 'lib/arm64-v8a/libnative.so']);
    await expect(validateAndroidArtifact(input(['android']))).resolves.toBeUndefined();
  });

  it('throws when APK has only ARM ABI entries', async () => {
    mockEntries(['lib/armeabi-v7a/libnative.so']);
    await expect(validateAndroidArtifact(input(['android']))).rejects.toThrow(
      'Your storybook.apk contains native libraries but does not include x86_64 support. Chromatic only supports x86_64.'
    );
  });

  it('throws when APK has multiple ARM ABIs but no x86_64', async () => {
    mockEntries(['lib/armeabi-v7a/libnative.so', 'lib/arm64-v8a/libnative.so']);
    await expect(validateAndroidArtifact(input(['android']))).rejects.toThrow(
      'Your storybook.apk contains native libraries but does not include x86_64 support. Chromatic only supports x86_64.'
    );
  });
});
