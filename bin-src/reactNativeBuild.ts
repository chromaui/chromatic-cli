import boxen from 'boxen';
import { execa } from 'execa';
import fs from 'fs';
import meow from 'meow';
import os from 'os';
import path from 'path';

const WARN_COLOR = '#FF4400';
const INFO_COLOR = '#2750F5';
const SUCCESS_COLOR = '#2ECC25';

interface ExpoConfig {
  platforms?: string[];
  scheme?: string;
}

function info(message: string, title?: string) {
  console.log(
    boxen(message, {
      title,
      padding: 1,
      borderStyle: 'single',
      borderColor: INFO_COLOR,
    })
  );
}

// execa wrapper for convenience
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

      EXPO_PUBLIC_STORYBOOK_ENABLED: 'true',
      STORYBOOK_ENABLED: 'true',

      EXPO_PUBLIC_STORYBOOK_LITE_MODE: 'true',
      STORYBOOK_LITE_MODE: 'true',

      EXPO_PUBLIC_STORYBOOK_WEBSOCKET_HOST: 'react-native.capture.chromatic.com',
      STORYBOOK_WEBSOCKET_HOST: 'react-native.capture.chromatic.com',

      EXPO_PUBLIC_STORYBOOK_WEBSOCKET_PORT: '7007',
      STORYBOOK_WEBSOCKET_PORT: '7007',

      EXPO_PUBLIC_STORYBOOK_WEBSOCKET_SECURED: 'true',
      STORYBOOK_WEBSOCKET_SECURED: 'true',
    },
  });
}

/**
 * Read the Expo config by running `npx expo config --json`.
 *
 * @returns Partial expo config.
 */
async function readExpoConfig() {
  try {
    const result = await execa('npx', ['expo', 'config', '--json']);
    return JSON.parse(result.stdout) as ExpoConfig;
  } catch {
    throw new Error(
      'Failed to read Expo config. Ensure Expo is installed and you are in an Expo project directory.'
    );
  }
}

/**
 * Build the Android artifact via expo prebuild and gradlew assembleRelease.
 *
 * @returns The path to the built APK file.
 */
async function buildAndroid() {
  const start = new Date();

  info('npx expo prebuild --platform android', 'Prebuild Android');
  await exec('npx', ['expo', 'prebuild', '--platform', 'android']);

  info('cd ./android && ./gradlew assembleRelease', 'Building Android');
  await exec('./gradlew', ['assembleRelease'], { cwd: path.resolve('android') });

  const apkPath = path.resolve('android/app/build/outputs/apk/release/app-release.apk');

  if (!fs.existsSync(apkPath)) {
    throw new Error(`Expected APK not found at ${apkPath}`);
  }

  return { artifactPath: apkPath, duration: (Date.now() - start.getTime()) / 1000 };
}

/**
 * Build the iOS artifact via expo prebuild and xcodebuild.
 *
 * @param scheme The iOS scheme to build, read from the Expo config.
 *
 * @returns The path to the built .app bundle.
 */
async function buildIos(scheme?: string) {
  const start = new Date();

  if (scheme === undefined) {
    throw new Error('Unable to determine scheme for iOS build.');
  }
  if (process.platform !== 'darwin') {
    throw new Error('iOS builds are only supported on macOS.');
  }

  info('npx expo prebuild --platform ios', 'Prebuild iOS');
  await exec('npx', ['expo', 'prebuild', '--platform', 'ios']);

  const derivedDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'chromatic-rn-ios-'));

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
    info(`xcodebuild ${xcodebuildArguments.join(' ')}`, 'Build iOS');
    await execa('xcodebuild', xcodebuildArguments, { cwd: path.resolve('ios') });
    if (!fs.existsSync(appPath)) {
      throw new Error(`Expected .app bundle not found at ${appPath}`);
    }
  } finally {
    fs.rmSync(derivedDataPath, { recursive: true, force: true });
  }

  return { artifactPath: appPath, duration: (Date.now() - start.getTime()) / 1000 };
}

/**
 * The main entrypoint for `chromatic react-native-build`.
 *
 * @param argv A list of arguments passed.
 */
export async function main(argv: string[]) {
  meow(
    `
        Usage
          $ chromatic react-native-build
        `,
    {
      argv,
      description: 'Build React Native Storybook for Chromatic',
    }
  );

  console.log(
    boxen(
      `This command will attempt to build your React Native Storybook for Chromatic.
This is alpha software, please report any issues you encounter on the Chromatic CLI GitHub repository.
Currently, only builds using Expo are supported.`,
      {
        title: 'Chromatic React Native Build',
        titleAlignment: 'center',
        padding: 1,
        borderStyle: 'double',
        borderColor: WARN_COLOR,
      }
    )
  );

  let config: ExpoConfig;
  try {
    config = await readExpoConfig();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const platforms = (config.platforms || []).filter((p) => ['android', 'ios'].includes(p));

  if (platforms.length === 0) {
    console.error(
      'No supported platforms found in Expo config. Expected "android" and/or "ios" in the platforms array.'
    );
    process.exit(1);
  }

  if (platforms.includes('ios') && !config.scheme) {
    console.error('No scheme found in Expo config. The scheme is required for iOS builds.');
    process.exit(1);
  }

  const artifacts: { platform: string; path: string; duration: number }[] = [];

  try {
    for (const platform of platforms) {
      if (platform === 'android') {
        const { artifactPath, duration } = await buildAndroid();
        artifacts.push({ platform: 'Android', path: artifactPath, duration });
      } else if (platform === 'ios') {
        const { artifactPath, duration } = await buildIos(config.scheme);
        artifacts.push({ platform: 'iOS', path: artifactPath, duration });
      }
    }
  } catch (err) {
    console.error(`\n${err.message}`);
    process.exit(1);
  }

  const summary = artifacts.map((a) => `${a.platform} (${a.duration})\n  ${a.path}`).join('\n');

  console.log(
    boxen(summary, {
      title: 'Build Complete',
      titleAlignment: 'center',
      padding: 1,
      borderStyle: 'double',
      borderColor: SUCCESS_COLOR,
    })
  );
}
