import AdmZip from 'adm-zip';
import path from 'path';

/**
 * Validates that the Android APK artifact contains x86_64 native libraries if it contains
 * any native libraries at all. Chromatic only supports x86_64 Android emulators.
 *
 * @param sourceDirectory - The directory containing the APK artifact
 *
 * @returns true if the APK contains x86_64 native libraries, false otherwise
 *
 * @throws {Error} if the APK contains native libraries without x86_64 support
 */
export async function validateAndroidArtifact(sourceDirectory: string): Promise<boolean> {
  const apkPath = path.join(sourceDirectory, 'storybook.apk');
  const zip = new AdmZip(apkPath);
  const entries = zip.getEntries();

  const abiDirectories = new Set<string>();
  for (const entry of entries) {
    const match = entry.entryName.match(/^lib\/([^/]+)\//);
    if (match) {
      abiDirectories.add(match[1]);
    }
  }

  return !(abiDirectories.size > 0 && !abiDirectories.has('x86_64'));
}
