import { createRequire } from 'module';
import path from 'path';
import semver from 'semver';

import { Context } from '../../types';
import unsupportedStorybookReactNativeVersion from '../../ui/messages/errors/unsupportedStorybookReactNativeVersion';
import { MINIMUM_STORYBOOK_REACT_NATIVE_VERSION } from './constants';

/**
 * Throws when the installed `@storybook/react-native` version is below the minimum supported
 * version (if we can determine it). Any unknown state (package not resolved, package.json
 * unreadable, invalid semver version) falls through in case we're simply looking in the wrong place
 * for the package.json (e.g. due to workspace layouts, etc.).
 *
 * @param ctx The context set when executing the CLI.
 */
export async function validateStorybookReactNativeVersion(
  ctx: Pick<Context, 'log' | 'ports'>
): Promise<void> {
  const version = await getInstalledStorybookReactNativeVersion(ctx);

  if (!version) {
    ctx.log.debug(`Could not determine @storybook/react-native version. Skipping version check.`);
    return;
  }

  if (!semver.valid(version)) {
    ctx.log.debug(
      `@storybook/react-native version "${version}" is not valid semver. Skipping version check.`
    );
    return;
  }

  if (semver.lt(version, MINIMUM_STORYBOOK_REACT_NATIVE_VERSION)) {
    throw new Error(unsupportedStorybookReactNativeVersion(version));
  }
}

/**
 * Locates the installed `@storybook/react-native` version by walking the `node_modules` paths that
 * Node would search from the user's project root. Uses `createRequire` so pnpm/yarn/npm workspace
 * layouts (including symlinked node_modules) resolve instead of just the project root. We read
 * `package.json` directly off disk rather than via `require.resolve('.../package.json')` because
 * `@storybook/react-native` declares an `exports` map that omits `./package.json`, which would
 * otherwise trigger ERR_PACKAGE_PATH_NOT_EXPORTED.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns The installed version of `@storybook/react-native`, or `undefined` if it could not be
 * determined.
 */
async function getInstalledStorybookReactNativeVersion(
  ctx: Pick<Context, 'log' | 'ports'>
): Promise<string | undefined> {
  const workingDirectory = process.cwd();
  ctx.log.debug(`Validating @storybook/react-native version from ${workingDirectory}`);

  const require = createRequire(path.join(workingDirectory, 'package.json'));

  const searchPaths = require.resolve.paths('@storybook/react-native') ?? [];
  let packageJsonPath: string | undefined;
  for (const nodeModulesPath of searchPaths) {
    const candidate = path.join(nodeModulesPath, '@storybook/react-native/package.json');
    if (await ctx.ports.fs.exists(candidate)) {
      packageJsonPath = candidate;
      break;
    }
  }

  if (!packageJsonPath) {
    ctx.log.debug(`Could not resolve @storybook/react-native from ${workingDirectory}`);
    return;
  }
  ctx.log.debug(`Resolved @storybook/react-native package.json at ${packageJsonPath}`);

  let installed: { version?: string };
  try {
    installed = (await ctx.ports.fs.readJson(packageJsonPath)) as { version?: string };
  } catch (err) {
    ctx.log.debug(
      `Failed to read @storybook/react-native package.json at ${packageJsonPath}: ${err.message}`
    );
    return;
  }

  const version = installed?.version;
  if (version) {
    ctx.log.debug(`Detected @storybook/react-native version: ${version}`);
  }
  return version;
}
