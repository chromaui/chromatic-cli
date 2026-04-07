import boxen from 'boxen';
import { execa } from 'execa';
import fs from 'fs';
import meow from 'meow';
import os from 'os';
import path from 'path';

interface ExpoConfig {
  platforms?: string[];
  scheme?: string;
}

/**
 * Run a shell command, streaming output to the terminal and teeing it into a log file.
 * Returns the log file path on failure for user reference.
 *
 * @param command
 * @param args
 * @param options
 * @param options.cwd
 */
async function runBuildCommand(
  command: string,
  args: string[],
  options: { cwd?: string } = {}
): Promise<void> {
  const logFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chromatic-rn-')), 'build.log');
  const logStream = fs.createWriteStream(logFile);

  try {
    const subprocess = execa(command, args, {
      cwd: options.cwd,
      stdout: ['inherit', logStream],
      stderr: ['inherit', logStream],
    });

    await subprocess;
  } catch {
    throw new Error(`Build command failed: ${command} ${args.join(' ')}\nSee log: ${logFile}`);
  } finally {
    logStream.close();
  }
}

/**
 * Read the Expo config by running `npx expo config --json`.
 *
 * @returns
 */
async function readExpoConfig(): Promise<ExpoConfig> {
  try {
    const result = await execa('npx', ['expo', 'config', '--json']);
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(
      'Failed to read Expo config. Ensure Expo is installed and you are in an Expo project directory.'
    );
  }
}

/**
 * Build the Android artifact via expo prebuild and gradlew assembleRelease.
 *
 * @returns
 */
async function buildAndroid(): Promise<string> {
  console.log(
    boxen('Building Android', { padding: 1, borderStyle: 'double', borderColor: '#0000FF' })
  );

  await runBuildCommand('npx', ['expo', 'prebuild', '--platform', 'android']);

  await runBuildCommand('./gradlew', ['assembleRelease'], {
    cwd: path.resolve('android'),
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
 * @param scheme
 *
 * @returns
 */
async function buildIos(scheme?: string): Promise<string> {
  if (scheme === undefined) {
    throw new Error('Unable to determine scheme for iOS build.');
  }
  if (process.platform !== 'darwin') {
    throw new Error('iOS builds are only supported on macOS.');
  }
  console.log(boxen('Building iOS', { padding: 1, borderStyle: 'double', borderColor: '#0000FF' }));

  await runBuildCommand('npx', ['expo', 'prebuild', '--platform', 'ios']);

  const derivedDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'chromatic-rn-ios-'));

  await runBuildCommand(
    'xcodebuild',
    [
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
    ],
    { cwd: path.resolve('ios') }
  );

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
        textAlignment: 'center',
        padding: 1,
        borderStyle: 'double',
        borderColor: '#FF4400',
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
    boxen(`Build complete!\n${summary}`, {
      padding: 1,
      borderStyle: 'double',
      borderColor: '#00FF00',
    })
  );
}
