import { execa } from 'execa';
import { existsSync, mkdtempSync, renameSync, rmSync, type WriteStream } from 'fs';
import os from 'os';
import path from 'path';

import { sanitizedName } from './expoConfig';

async function exec(
  command: string,
  args: string[],
  options: { env?: Record<string, string>; cwd?: string } = {},
  logStream: WriteStream
) {
  return execa(command, args, {
    ...options,
    stdout: logStream,
    stderr: logStream,
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
 * Validate that the parent directory of the output path exists.
 *
 * @param outputPath The full file path where the built artifact should be placed.
 */
function validateOutputPath(outputPath: string) {
  const parentDirectory = path.dirname(outputPath);
  if (!existsSync(parentDirectory)) {
    throw new Error(`Output directory does not exist: ${parentDirectory}`);
  }
}

/**
 * Build the Android artifact via expo prebuild and gradlew assembleRelease.
 *
 * @param outputPath The full file path where the built APK should be placed.
 * @param logStream The WriteStream to write build logs to.
 *
 * @returns The build duration in seconds.
 */
export async function buildAndroid(outputPath: string, logStream: WriteStream) {
  validateOutputPath(outputPath);

  const start = new Date();

  logStream.write('\n[chromatic] Android build: npx expo prebuild --platform android\n');
  await exec('npx', ['expo', 'prebuild', '--platform', 'android'], {}, logStream);

  logStream.write(
    '\n[chromatic] Android build: ./gradlew assembleRelease -PreactNativeArchitectures=x86_64\n'
  );
  await exec(
    './gradlew',
    ['assembleRelease', '-PreactNativeArchitectures=x86_64'],
    { cwd: path.resolve('android') },
    logStream
  );

  const apkPath = path.resolve('android/app/build/outputs/apk/release/app-release.apk');

  if (!existsSync(apkPath)) {
    throw new Error(`Expected APK not found at ${apkPath}`);
  }

  renameSync(apkPath, outputPath);

  return (Date.now() - start.getTime()) / 1000;
}

/**
 * Build the iOS artifact via expo prebuild and xcodebuild.
 *
 * @param name The app name from the Expo config, used to derive the xcodebuild file names and scheme.
 * @param outputPath The full file path where the built .app bundle should be placed.
 * @param logStream The WriteStream to write build logs to.
 *
 * @returns The build duration in seconds.
 */
export async function buildIos(name: string, outputPath: string, logStream: WriteStream) {
  validateOutputPath(outputPath);

  const start = new Date();

  if (process.platform !== 'darwin') {
    throw new Error('iOS builds are only supported on macOS.');
  }

  const cleanName = sanitizedName(name);

  logStream.write('\n[chromatic] iOS build: npx expo prebuild --platform ios\n');
  await exec('npx', ['expo', 'prebuild', '--platform', 'ios'], {}, logStream);

  const derivedDataPath = mkdtempSync(path.join(os.tmpdir(), 'chromatic-rn-ios-'));

  const xcodebuildArguments = [
    '-workspace',
    `${cleanName}.xcworkspace`,
    '-scheme',
    cleanName,
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
    `${cleanName}.app`
  );

  logStream.write(`\n[chromatic] iOS build: xcodebuild ${xcodebuildArguments.join(' ')}\n`);

  try {
    await execa('xcodebuild', xcodebuildArguments, {
      cwd: path.resolve('ios'),
      stdout: logStream,
      stderr: logStream,
    });
    if (!existsSync(appPath)) {
      throw new Error(`Expected .app bundle not found at ${appPath}`);
    }

    renameSync(appPath, outputPath);

    return (Date.now() - start.getTime()) / 1000;
  } finally {
    rmSync(derivedDataPath, { recursive: true, force: true });
  }
}
