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
  console.log(
    boxen('npx expo prebuild --platform android', {
      title: 'Prebuild Android',
      padding: 1,
      borderStyle: 'single',
      borderColor: INFO_COLOR,
    })
  );

  await execa('npx', ['expo', 'prebuild', '--platform', 'android'], {
    stdout: 'inherit',
    stderr: 'inherit',
  });

  console.log(
    boxen('cd ./android && ./gradlew assembleRelease', {
      title: 'Building Android',
      padding: 1,
      borderStyle: 'single',
      borderColor: INFO_COLOR,
    })
  );
  await execa('./gradlew', ['assembleRelease'], {
    cwd: path.resolve('android'),
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const apkPath = path.resolve('android/app/build/outputs/apk/release/app-release.apk');

  if (!fs.existsSync(apkPath)) {
    throw new Error(`Expected APK not found at ${apkPath}`);
  }

  return apkPath;
}

/**
 * Build the iOS artifact via expo prebuild and xcodebuild.
 *
 * @param scheme The iOS scheme to build, read from the Expo config.
 *
 * @returns The path to the built .app bundle.
 */
async function buildIos(scheme?: string) {
  if (scheme === undefined) {
    throw new Error('Unable to determine scheme for iOS build.');
  }
  if (process.platform !== 'darwin') {
    throw new Error('iOS builds are only supported on macOS.');
  }
  console.log(
    boxen('npx expo prebuild --platform ios', {
      title: 'Prebuild iOS',
      padding: 1,
      borderStyle: 'single',
      borderColor: INFO_COLOR,
    })
  );

  await execa('npx', ['expo', 'prebuild', '--platform', 'ios'], {
    stdout: 'inherit',
    stderr: 'inherit',
  });

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

  console.log(
    boxen(`xcodebuild ${xcodebuildArguments.join(' ')}`, {
      title: 'Build iOS',
      padding: 1,
      borderStyle: 'single',
      borderColor: INFO_COLOR,
    })
  );

  await execa('xcodebuild', xcodebuildArguments, {
    cwd: path.resolve('ios'),
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const appPath = path.join(
    derivedDataPath,
    'Build',
    'Products',
    'Release-iphonesimulator',
    `${scheme}.app`
  );

  if (!fs.existsSync(appPath)) {
    fs.rmSync(derivedDataPath, { recursive: true, force: true });
    throw new Error(`Expected .app bundle not found at ${appPath}`);
  }

  return appPath;
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

  const artifacts: { platform: string; path: string }[] = [];

  try {
    for (const platform of platforms) {
      if (platform === 'android') {
        const artifactPath = await buildAndroid();
        artifacts.push({ platform: 'Android', path: artifactPath });
      } else if (platform === 'ios') {
        const artifactPath = await buildIos(config.scheme);
        artifacts.push({ platform: 'iOS', path: artifactPath });
      }
    }
  } catch (err) {
    console.error(`\n${err.message}`);
    process.exit(1);
  }

  const summary = artifacts.map((a) => `  ${a.platform}: ${a.path}`).join('\n');
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
