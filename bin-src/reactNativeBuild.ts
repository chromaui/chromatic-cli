import chalk from 'chalk';
import { type WriteStream } from 'fs';
import meow from 'meow';
import os from 'os';
import path from 'path';

import { openLogFileStream } from '../node-src/lib/logFile';
import { buildAndroid, buildIos } from '../node-src/lib/react-native/build';
import { ExpoConfig, readExpoConfig } from '../node-src/lib/react-native/expoConfig';

const platformNames: Record<string, string> = {
  android: 'Android',
  ios: 'iOS',
};

function info(title: string, message?: string) {
  console.log('› ' + chalk.bold(title) + (message ? '\n  ' + chalk.dim('→ ' + message) : ''));
}

function error(message: string, title?: string) {
  console.error(chalk.bold.red('✖ ') + chalk.bold(title || 'Error') + '\n  → ' + message);
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

  return platforms;
}

/**
 * Build all requested platforms and return the artifacts.
 *
 * @param platforms The platforms to build.
 * @param appName The app name from Expo config, required for iOS builds.
 * @param logStream The WriteStream to write build logs to.
 *
 * @returns The list of build artifacts.
 */
async function buildPlatforms(platforms: string[], appName: string, logStream: WriteStream) {
  const artifacts: { platform: string; path: string; duration: number }[] = [];

  for (const platform of platforms) {
    info(`Building for ${platformNames[platform]}`);
    if (platform === 'android') {
      const { artifactPath, duration } = await buildAndroid(logStream);
      artifacts.push({ platform: 'Android', path: artifactPath, duration });
    } else if (platform === 'ios') {
      const { artifactPath, duration } = await buildIos(appName, logStream);
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
    chalk.bold.yellow('⚠ ') +
      chalk.bold('Chromatic React Native Build is in alpha. Use with caution.') +
      '\n' +
      chalk.dim(
        '  → Please report any issues you encounter on the Chromatic CLI GitHub repository.'
      )
  );

  let config: ExpoConfig;
  try {
    info('Reading configuration from Expo', 'npx expo config --json');
    config = await readExpoConfig();
  } catch (err) {
    error(err.message);
    process.exit(1);
  }

  const platforms = resolvePlatforms(config, requestedPlatforms);

  const logFilePath = path.join(os.tmpdir(), `chromatic-react-native-build-${Date.now()}.log`);
  const logStream = await openLogFileStream(logFilePath);

  let artifacts: { platform: string; path: string; duration: number }[];
  try {
    artifacts = await buildPlatforms(platforms, config.name, logStream);
  } catch (err) {
    await new Promise<void>((resolve) => logStream.end(resolve));
    error(err.message);
    info('Build failed, see log for details', logFilePath);
    process.exit(1);
  } finally {
    await new Promise<void>((resolve) => logStream.end(resolve));
  }

  const summary = artifacts
    .map((a) => `${a.platform} (${humanizeDuration(a.duration)})\n${a.path}`)
    .join('\n\n');

  console.log(chalk.bold.green('✔ ') + chalk.bold('Build Complete') + '\n' + summary);
}
