import { execa } from 'execa';
import { existsSync, mkdtempSync, renameSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';

async function exec(
  command: string,
  args: string[],
  options: { env?: Record<string, string>; cwd?: string } = {}
) {
  return execa(command, args, {
    ...options,
    stdout: 'inherit',
    stderr: 'inherit',
    env: {
      ...options.env,

      // Expo requires the EXPO_PUBLIC_ prefix on environment variables, so we set
      // both versions to support Expo and other tooling.

      EXPO_PUBLIC_STORYBOOK_ENABLED: 'true',
      STORYBOOK_ENABLED: 'true',

      EXPO_PUBLIC_STORYBOOK_DISABLE_UI: 'true',
      STORYBOOK_DISABLE_UI: 'true',

      EXPO_PUBLIC_STORYBOOK_WEBSOCKET_HOST: 'react-native.capture.chromatic.com',
      STORYBOOK_WEBSOCKET_HOST: 'react-native.capture.chromatic.com',

      EXPO_PUBLIC_STORYBOOK_WEBSOCKET_PORT: '7007',
      STORYBOOK_WEBSOCKET_PORT: '7007',

      EXPO_PUBLIC_STORYBOOK_WEBSOCKET_SECURED: 'true',
      STORYBOOK_WEBSOCKET_SECURED: 'true',

      EXPO_STORYBOOK_SERVER: 'false',
      STORYBOOK_SERVER: 'false',
    },
  });
}

/**
 * Build the Android artifact via expo prebuild and gradlew assembleRelease.
 *
 * @returns The path to the built APK file and duration in seconds.
 */
export async function buildAndroid() {
  const start = new Date();

  await exec('npx', ['expo', 'prebuild', '--platform', 'android']);
  await exec('./gradlew', ['assembleRelease'], { cwd: path.resolve('android') });

  const apkPath = path.resolve('android/app/build/outputs/apk/release/app-release.apk');

  if (!existsSync(apkPath)) {
    throw new Error(`Expected APK not found at ${apkPath}`);
  }

  return { artifactPath: apkPath, duration: (Date.now() - start.getTime()) / 1000 };
}

/**
 * Build the iOS artifact via expo prebuild and xcodebuild.
 *
 * @param scheme The iOS scheme to build, read from the Expo config.
 *
 * @returns The path to the built .app bundle and duration in seconds.
 */
export async function buildIos(scheme?: string) {
  const start = new Date();

  if (scheme === undefined) {
    throw new Error('Unable to determine scheme for iOS build.');
  }
  if (process.platform !== 'darwin') {
    throw new Error('iOS builds are only supported on macOS.');
  }

  await exec('npx', ['expo', 'prebuild', '--platform', 'ios']);

  const derivedDataPath = mkdtempSync(path.join(os.tmpdir(), 'chromatic-rn-ios-'));

  const xcodebuildArguments = [
    '-workspace',
    `${scheme}.xcworkspace`,
    '-scheme',
    scheme,
    '-configuration',
    'Release',
    '-sdk',
    'iphonesimulator',
    '-derivedDataPath',
    derivedDataPath,
    'CODE_SIGNING_ALLOWED=NO',
    'CODE_SIGNING_REQUIRED=NO',
    'CODE_SIGN_ENTITLEMENTS=""',
    'CODE_SIGN_IDENTITY=""',
    'build',
  ];

  const appPath = path.join(
    derivedDataPath,
    'Build',
    'Products',
    'Release-iphonesimulator',
    `${scheme}.app`
  );

  try {
    await execa('xcodebuild', xcodebuildArguments, { cwd: path.resolve('ios') });
    if (!existsSync(appPath)) {
      throw new Error(`Expected .app bundle not found at ${appPath}`);
    }

    const artifactDirectory = mkdtempSync(path.join(os.tmpdir(), 'chromatic-rn-ios-artifact-'));
    const artifactPath = path.join(artifactDirectory, `${scheme}.app`);
    renameSync(appPath, artifactPath);

    return { artifactPath, duration: (Date.now() - start.getTime()) / 1000 };
  } finally {
    rmSync(derivedDataPath, { recursive: true, force: true });
  }
}
