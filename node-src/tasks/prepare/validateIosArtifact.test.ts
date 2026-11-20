import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';

import { validateIosArtifact } from './validateIosArtifact';

// Binary Info.plists from one SwiftUI app built three ways with Xcode 27.3.
const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__');

const sourceDirectories: string[] = [];

afterEach(() => {
  for (const directory of sourceDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const sourceDirectoryWith = (infoPlist: Buffer | string) => {
  const sourceDirectory = mkdtempSync(path.join(tmpdir(), 'validate-ios-'));
  sourceDirectories.push(sourceDirectory);
  mkdirSync(path.join(sourceDirectory, 'storybook.app'));
  writeFileSync(path.join(sourceDirectory, 'storybook.app', 'Info.plist'), infoPlist);
  return sourceDirectory;
};

const fixture = (name: string) => sourceDirectoryWith(readFileSync(path.join(fixtures, name)));

const xmlPlist = (keys: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>com.example.storybook</string>
  ${keys}
</dict>
</plist>
`;

const simulatorPlatform =
  '<key>CFBundleSupportedPlatforms</key><array><string>iPhoneSimulator</string></array>';

const deviceBuildError =
  'Your storybook.app was built for iPhoneOS, not the iOS simulator. Chromatic only supports iOS simulator builds.';
const tabletOnlyError =
  "Your storybook.app supports iPad but not iPhone. Chromatic captures iOS stories on iPhone simulators, so add iPhone to the app's targeted device families.";

describe('validateIosArtifact', () => {
  it('skips when ios is not in browsers', async () => {
    // No storybook.app at all: reading it would throw.
    await expect(
      validateIosArtifact({ sourceDir: '/does/not/exist', browsers: ['android'] })
    ).resolves.toBeUndefined();
  });

  it('passes a simulator build that supports iPhone', async () => {
    const sourceDirectory = fixture('simulator-build.Info.plist');
    await expect(
      validateIosArtifact({ sourceDir: sourceDirectory, browsers: ['ios'] })
    ).resolves.toBeUndefined();
  });

  it('throws for a device build', async () => {
    const sourceDirectory = fixture('device-build.Info.plist');
    await expect(
      validateIosArtifact({ sourceDir: sourceDirectory, browsers: ['ios'] })
    ).rejects.toThrow(deviceBuildError);
  });

  it('throws for an iPad-only simulator build', async () => {
    const sourceDirectory = fixture('ipad-only.Info.plist');
    await expect(
      validateIosArtifact({ sourceDir: sourceDirectory, browsers: ['ios'] })
    ).rejects.toThrow(tabletOnlyError);
  });

  it('passes when any supported platform is the simulator', async () => {
    const sourceDirectory = sourceDirectoryWith(
      xmlPlist(
        '<key>CFBundleSupportedPlatforms</key><array><string>iPhoneOS</string><string>iPhoneSimulator</string></array>'
      )
    );
    await expect(
      validateIosArtifact({ sourceDir: sourceDirectory, browsers: ['ios'] })
    ).resolves.toBeUndefined();
  });

  it('falls back to DTPlatformName, naming the platform the same way', async () => {
    const sourceDirectory = sourceDirectoryWith(
      xmlPlist('<key>DTPlatformName</key><string>iphoneos</string>')
    );
    await expect(
      validateIosArtifact({ sourceDir: sourceDirectory, browsers: ['ios'] })
    ).rejects.toThrow(deviceBuildError);
  });

  it('names an unknown device family by its number', async () => {
    const sourceDirectory = sourceDirectoryWith(
      xmlPlist(
        `${simulatorPlatform}<key>UIDeviceFamily</key><array><integer>2</integer><integer>9</integer></array>`
      )
    );
    await expect(
      validateIosArtifact({ sourceDir: sourceDirectory, browsers: ['ios'] })
    ).rejects.toThrow('Your storybook.app supports iPad, device family 9 but not iPhone.');
  });

  it('reads device families written as strings', async () => {
    const sourceDirectory = sourceDirectoryWith(
      xmlPlist(
        `${simulatorPlatform}<key>UIDeviceFamily</key><array><string>1</string><string>2</string></array>`
      )
    );
    await expect(
      validateIosArtifact({ sourceDir: sourceDirectory, browsers: ['ios'] })
    ).resolves.toBeUndefined();
  });

  it.each([
    ['garbage', 'not a plist'],
    ['malformed XML', '<?xml version="1.0"?><plist><dict><key>'],
    ['a truncated binary plist', Buffer.from('bplist00\u00D1\u0001\u0002')],
    [
      'mistyped keys',
      xmlPlist(
        '<key>CFBundleSupportedPlatforms</key><string>iPhoneOS</string><key>DTPlatformName</key><integer>1</integer><key>UIDeviceFamily</key><integer>2</integer>'
      ),
    ],
  ])('leaves %s to the install', async (_name, infoPlist) => {
    const sourceDirectory = sourceDirectoryWith(infoPlist);
    await expect(
      validateIosArtifact({ sourceDir: sourceDirectory, browsers: ['ios'] })
    ).resolves.toBeUndefined();
  });

  it('leaves a missing Info.plist to the install', async () => {
    const sourceDirectory = sourceDirectoryWith('');
    rmSync(path.join(sourceDirectory, 'storybook.app', 'Info.plist'));
    await expect(
      validateIosArtifact({ sourceDir: sourceDirectory, browsers: ['ios'] })
    ).resolves.toBeUndefined();
  });

  it('passes when the plist names no platform or device family', async () => {
    const sourceDirectory = sourceDirectoryWith(xmlPlist(''));
    await expect(
      validateIosArtifact({ sourceDir: sourceDirectory, browsers: ['ios'] })
    ).resolves.toBeUndefined();
  });
});
