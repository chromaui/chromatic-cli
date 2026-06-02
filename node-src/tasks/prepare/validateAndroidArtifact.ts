import AdmZip from 'adm-zip';
import path from 'path';

import { Context } from '../../types';
import { invalidAndroidArtifact } from '../../ui/tasks/prepare';

/**
 * Validates that the Android APK artifact contains x86_64 native libraries if it contains
 * any native libraries at all. Chromatic only supports x86_64 Android emulators.
 *
 * @param ctx - The CLI context containing source directory and build info
 *
 * @throws {Error} if the APK contains native libraries without x86_64 support
 */
export async function validateAndroidArtifact(ctx: Context) {
  if (!ctx.announcedBuild?.browsers?.includes('android')) return;

  const apkPath = path.join(ctx.sourceDir, 'storybook.apk');
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
    throw new Error(invalidAndroidArtifact(ctx).output);
  }
}
