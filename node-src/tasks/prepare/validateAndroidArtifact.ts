import AdmZip from 'adm-zip';
import path from 'path';

import { invalidAndroidArtifact } from '../../ui/tasks/prepare';

export interface ValidateAndroidArtifactInput {
  sourceDir: string;
  browsers?: string[];
}

/**
 * Validates that the Android APK artifact contains x86_64 native libraries if it contains
 * any native libraries at all. Chromatic only supports x86_64 Android emulators.
 *
 * @param input - The source directory and the build's enabled browsers.
 *
 * @throws {Error} if the APK contains native libraries without x86_64 support
 */
export async function validateAndroidArtifact(input: ValidateAndroidArtifactInput) {
  if (!input.browsers?.includes('android')) return;

  const apkPath = path.join(input.sourceDir, 'storybook.apk');
  const zip = new AdmZip(apkPath);
  const entries = zip.getEntries();

  const abiDirectories = new Set<string>();
  for (const entry of entries) {
    const match = entry.entryName.match(/^lib\/([^/]+)\//);
    if (match) {
      abiDirectories.add(match[1]);
    }
  }

  if (abiDirectories.size > 0 && !abiDirectories.has('x86_64')) {
    throw new Error(invalidAndroidArtifact().output);
  }
}
