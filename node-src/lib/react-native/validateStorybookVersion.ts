import { readJson } from 'fs-extra';
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
 * Resolution uses `createRequire` rooted at the user's project so pnpm/yarn/npm workspace layouts
 * (including symlinked node_modules) resolve instead of just the project root.
 *
 * @param ctx The context set when executing the CLI.
 */
export async function validateStorybookReactNativeVersion(
  ctx: Pick<Context, 'log'>
): Promise<void> {
  const projectRoot = process.cwd();
  ctx.log.debug(`Validating @storybook/react-native version from ${projectRoot}`);

  const require = createRequire(path.join(projectRoot, 'package.json'));

  let packageJsonPath: string;
  try {
    packageJsonPath = require.resolve('@storybook/react-native/package.json');
    ctx.log.debug(`Resolved @storybook/react-native package.json at ${packageJsonPath}`);
  } catch (err) {
    ctx.log.error(`Could not resolve @storybook/react-native from ${projectRoot}: ${err.message}`);
    return;
  }

  let installed: { version?: string };
  try {
    installed = await readJson(packageJsonPath);
  } catch (err) {
    ctx.log.error(
      `Failed to read @storybook/react-native package.json at ${packageJsonPath}: ${err.message}`
    );
    return;
  }

  const version = installed?.version ?? 'unknown';
  ctx.log.debug(`Detected @storybook/react-native version: ${version}`);

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
