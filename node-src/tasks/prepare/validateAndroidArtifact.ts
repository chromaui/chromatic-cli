import AdmZip from 'adm-zip';
import path from 'path';

import { invalidAndroidArtifact } from '../../ui/tasks/prepare';

export interface ValidateAndroidArtifactInput {
  sourceDir: string;
  browsers?: string[];
}

// Entries every APK built from a React Native project has at its root.
const REQUIRED_APK_ENTRIES = ['AndroidManifest.xml', 'resources.arsc'];

// Entries only an Android App Bundle (.aab) has. Its manifest lives under base/, not at the root.
const APP_BUNDLE_ENTRIES = new Set(['BundleConfig.pb', 'base/manifest/AndroidManifest.xml']);

/**
 * Reads the names of the entries in the APK.
 *
 * @param apkPath - The path to storybook.apk.
 *
 * @returns The entry names.
 *
 * @throws {Error} if the file is not a zip
 */
function readEntryNames(apkPath: string) {
  try {
    return new AdmZip(apkPath).getEntries().map((entry) => entry.entryName);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(invalidAndroidArtifact({ unreadable: reason }).output);
  }
}

/**
 * Validates that the Android artifact is an APK that can run on Chromatic's emulators: a zip with
 * AndroidManifest.xml and resources.arsc at its root, not an Android App Bundle, and with x86_64
 * native libraries if it contains any native libraries at all.
 *
 * @param input - The source directory and the build's enabled browsers.
 *
 * @throws {Error} if the artifact is not an APK, or contains native libraries without x86_64
 * support
 */
export async function validateAndroidArtifact(input: ValidateAndroidArtifactInput) {
  if (!input.browsers?.includes('android')) return;

  const entryNames = readEntryNames(path.join(input.sourceDir, 'storybook.apk'));

  if (entryNames.some((name) => APP_BUNDLE_ENTRIES.has(name))) {
    throw new Error(invalidAndroidArtifact('appBundle').output);
  }

  const missing = REQUIRED_APK_ENTRIES.find((name) => !entryNames.includes(name));
  if (missing) {
    throw new Error(invalidAndroidArtifact({ unreadable: `it has no ${missing}` }).output);
  }

  const abiDirectories = new Set<string>();
  for (const name of entryNames) {
    const match = name.match(/^lib\/([^/]+)\//);
    if (match) {
      abiDirectories.add(match[1]);
    }
  }

  if (abiDirectories.size > 0 && !abiDirectories.has('x86_64')) {
    throw new Error(invalidAndroidArtifact('noX86_64').output);
  }
}
