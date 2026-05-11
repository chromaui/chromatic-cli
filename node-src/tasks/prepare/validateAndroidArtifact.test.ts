import AdmZip from 'adm-zip';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { validateAndroidArtifact } from './validateAndroidArtifact';

vi.mock('adm-zip', () => ({ default: vi.fn() }));

const AdmZipMock = vi.mocked(AdmZip);

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

const mockEntries = (entryNames: string[]) => {
  const entries = entryNames.map((entryName) => ({ entryName }));
  AdmZipMock.mockImplementation(function (this: { getEntries: () => typeof entries }) {
    this.getEntries = () => entries;
  } as any);
};

describe('validateAndroidArtifact', () => {
  it('returns true when APK has no lib/ entries', async () => {
    mockEntries(['AndroidManifest.xml', 'classes.dex']);
    await expect(validateAndroidArtifact('/static/')).resolves.toBe(true);
  });

  it('returns true when APK has only lib/x86_64/ entries', async () => {
    mockEntries(['lib/x86_64/libnative.so']);
    await expect(validateAndroidArtifact('/static/')).resolves.toBe(true);
  });

  it('returns true when APK has lib/x86_64/ alongside other ABIs', async () => {
    mockEntries(['lib/x86_64/libnative.so', 'lib/arm64-v8a/libnative.so']);
    await expect(validateAndroidArtifact('/static/')).resolves.toBe(true);
  });

  it('returns false when APK has only ARM ABI entries', async () => {
    mockEntries(['lib/armeabi-v7a/libnative.so']);
    await expect(validateAndroidArtifact('/static/')).resolves.toBe(false);
  });

  it('returns false when APK has multiple ARM ABIs but no x86_64', async () => {
    mockEntries(['lib/armeabi-v7a/libnative.so', 'lib/arm64-v8a/libnative.so']);
    await expect(validateAndroidArtifact('/static/')).resolves.toBe(false);
  });

  it('reads the APK from storybook.apk under the given source directory', async () => {
    mockEntries([]);
    await validateAndroidArtifact('/some/source/dir');
    expect(AdmZipMock).toHaveBeenCalledWith('/some/source/dir/storybook.apk');
  });
});
