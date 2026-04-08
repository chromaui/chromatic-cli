import boxen from 'boxen';
import { execa } from 'execa';
import fs from 'fs';
import meow from 'meow';
import os from 'os';
import path from 'path';

const ERROR_COLOR = '#FF0000';
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

function error(message: string, title?: string) {
  console.error(
    boxen(message, {
      title: title || 'Error',
      padding: 1,
      borderStyle: 'double',
      borderColor: ERROR_COLOR,
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

function humanizeDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

const SUPPORTED_PLATFORMS = ['android', 'ios'];

/**
 * Parse CLI flags from argv.
 *
 * @param argv A list of arguments passed.
 *
 * @returns Validated requested platforms, or undefined if none specified.
 */
function parseFlags(argv: string[]) {
  const { flags } = meow(
    `
        Usage
          $ chromatic react-native-build [options]

        Options
          --platform  Platform to build (android, ios). Can be specified multiple times. Defaults to all platforms in Expo config.
        `,
    {
      argv,
      description: 'Build React Native Storybook for Chromatic',
      flags: {
        platform: {
          type: 'string',
          isMultiple: true,
        },
      },
    }
  );

  const requestedPlatforms =
    flags.platform && flags.platform.length > 0 ? flags.platform : undefined;

  return requestedPlatforms;
}

/**
 * Resolve the platforms to build by intersecting the Expo config with the requested platforms.
 *
 * @param config The Expo config.
 * @param requestedPlatforms The platforms requested by the user, or undefined for all.
 *
 * @returns The resolved list of platforms to build.
 */
function resolvePlatforms(config: ExpoConfig, requestedPlatforms: string[] | undefined) {
  if (requestedPlatforms) {
    const invalid = requestedPlatforms.filter((p) => !SUPPORTED_PLATFORMS.includes(p));
    if (invalid.length > 0) {
      error(`Invalid platform ${invalid.map((p) => `"${p}"`).join(', ')}.
Supported platforms: ${SUPPORTED_PLATFORMS.join(', ')}`);
      process.exit(1);
    }
  }

  const configPlatforms = (config.platforms || []).filter((p) => SUPPORTED_PLATFORMS.includes(p));

  if (configPlatforms.length === 0) {
    error(
      'No supported platforms found in Expo config. Expected "android" and/or "ios" in the platforms array.'
    );
    process.exit(1);
  }

  const platforms = requestedPlatforms
    ? configPlatforms.filter((p) => requestedPlatforms.includes(p))
    : configPlatforms;

  if (platforms.length === 0) {
    error(`Requested platform ${(requestedPlatforms || []).map((p) => `"${p}"`).join(', ')} not found in Expo config.
Available platforms: ${configPlatforms.join(', ')}`);
    process.exit(1);
  }

  if (platforms.includes('ios') && !config.scheme) {
    error('No scheme found in Expo config. The scheme is required for iOS builds.');
    process.exit(1);
  }

  return platforms;
}

/**
 * Build all requested platforms and return the artifacts.
 *
 * @param platforms The platforms to build.
 * @param scheme The iOS scheme from Expo config.
 *
 * @returns The list of build artifacts.
 */
async function buildPlatforms(platforms: string[], scheme?: string) {
  const artifacts: { platform: string; path: string; duration: number }[] = [];

  for (const platform of platforms) {
    if (platform === 'android') {
      const { artifactPath, duration } = await buildAndroid();
      artifacts.push({ platform: 'Android', path: artifactPath, duration });
    } else if (platform === 'ios') {
      const { artifactPath, duration } = await buildIos(scheme);
      artifacts.push({ platform: 'iOS', path: artifactPath, duration });
    }
  }

  return artifacts;
}

/**
 * The main entrypoint for `chromatic react-native-build`.
 *
 * @param argv A list of arguments passed.
 */
export async function main(argv: string[]) {
  const requestedPlatforms = parseFlags(argv);

  console.log(
    boxen(
      `This command will attempt to build your React Native Storybook for Chromatic.
This is alpha software, please report any issues you encounter on the Chromatic CLI GitHub repository.
Currently, only projects using Expo are supported.`,
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
    error(err.message);
    process.exit(1);
  }

  const platforms = resolvePlatforms(config, requestedPlatforms);

  let artifacts: { platform: string; path: string; duration: number }[];
  try {
    artifacts = await buildPlatforms(platforms, config.scheme);
  } catch (err) {
    error(err.message);
    process.exit(1);
  }

  const summary = artifacts
    .map((a) => `${a.platform} (${humanizeDuration(a.duration)})\n${a.path}`)
    .join('\n\n');

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
