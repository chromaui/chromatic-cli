import AdmZip from 'adm-zip';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { validateAndroidArtifact } from './validateAndroidArtifact';

let sourceDirectory: string;

beforeEach(() => {
  sourceDirectory = mkdtempSync(path.join(tmpdir(), 'validate-android-'));
});

afterEach(() => {
  rmSync(sourceDirectory, { recursive: true, force: true });
});

const input = (browsers: string[]) => ({ sourceDir: sourceDirectory, browsers });

const writeApk = (entryNames: string[]) => {
  const zip = new AdmZip();
  for (const name of entryNames) zip.addFile(name, Buffer.from('x'));
  zip.writeZip(path.join(sourceDirectory, 'storybook.apk'));
};

// The root entries every APK built from a React Native project has.
const apk = (...entryNames: string[]) => ['AndroidManifest.xml', 'resources.arsc', ...entryNames];

const x86Error =
  'Your storybook.apk contains native libraries but does not include x86_64 support. Chromatic only supports x86_64.';

describe('validateAndroidArtifact', () => {
  it('skips when android is not in browsers', async () => {
    await expect(validateAndroidArtifact(input(['ios']))).resolves.toBeUndefined();
  });

  it('passes when APK has no lib/ entries', async () => {
    writeApk(apk('classes.dex'));
    await expect(validateAndroidArtifact(input(['android']))).resolves.toBeUndefined();
  });

  it('passes when APK has only lib/x86_64/ entries', async () => {
    writeApk(apk('lib/x86_64/libnative.so'));
    await expect(validateAndroidArtifact(input(['android']))).resolves.toBeUndefined();
  });

  it('passes when APK has lib/x86_64/ alongside other ABIs', async () => {
    writeApk(apk('lib/x86_64/libnative.so', 'lib/arm64-v8a/libnative.so'));
    await expect(validateAndroidArtifact(input(['android']))).resolves.toBeUndefined();
  });

  it('throws when APK has only ARM ABI entries', async () => {
    writeApk(apk('lib/armeabi-v7a/libnative.so'));
    await expect(validateAndroidArtifact(input(['android']))).rejects.toThrow(x86Error);
  });

  it('throws when APK has multiple ARM ABIs but no x86_64', async () => {
    writeApk(apk('lib/armeabi-v7a/libnative.so', 'lib/arm64-v8a/libnative.so'));
    await expect(validateAndroidArtifact(input(['android']))).rejects.toThrow(x86Error);
  });

  it('throws when the artifact is an Android App Bundle', async () => {
    // The layout bundletool gives an .aab, with ARM-only native libraries, which it reports first.
    writeApk([
      'BundleConfig.pb',
      'base/manifest/AndroidManifest.xml',
      'base/resources.pb',
      'base/lib/arm64-v8a/libnative.so',
    ]);
    await expect(validateAndroidArtifact(input(['android']))).rejects.toThrow(
      'Your storybook.apk is an Android App Bundle (.aab), not an APK. Build an APK instead, such as with ./gradlew assembleRelease or an EAS build profile with "buildType": "apk".'
    );
  });

  it('throws when the artifact is an empty zip', async () => {
    writeApk([]);
    await expect(validateAndroidArtifact(input(['android']))).rejects.toThrow(
      'Your storybook.apk could not be read as an APK (it has no AndroidManifest.xml). Chromatic needs an APK, such as one built with ./gradlew assembleRelease.'
    );
  });

  it('throws when the APK has no resources.arsc', async () => {
    writeApk(['AndroidManifest.xml', 'classes.dex']);
    await expect(validateAndroidArtifact(input(['android']))).rejects.toThrow(
      'could not be read as an APK (it has no resources.arsc)'
    );
  });

  it('throws when the artifact is not a zip', async () => {
    writeFileSync(path.join(sourceDirectory, 'storybook.apk'), 'not an apk');
    await expect(validateAndroidArtifact(input(['android']))).rejects.toThrow(
      /^Your storybook\.apk could not be read as an APK \(.*Invalid or unsupported zip format.*\)\. Chromatic needs an APK/
    );
  });
});
