import { readJson } from 'fs-extra';
import { createRequire } from 'module';
import path from 'path';
import semver from 'semver';

import missingStorybookReactNativePackage from '../../ui/messages/errors/missingStorybookReactNativePackage';
import unsupportedStorybookReactNativeVersion from '../../ui/messages/errors/unsupportedStorybookReactNativeVersion';

export const MINIMUM_STORYBOOK_REACT_NATIVE_VERSION = '9.0.0';

/**
 * Ensures the installed `@storybook/react-native` package meets Chromatic's minimum supported
 * version. Throws a clear error if the package is missing or below the minimum so the build can
 * exit before running into less actionable downstream errors.
 *
 * Resolution uses `createRequire` rooted at the user's project so pnpm/yarn/npm workspace
 * layouts (including symlinked node_modules) resolve instead of just the project root.
 */
export async function validateStorybookReactNativeVersion(): Promise<void> {
  const require = createRequire(path.join(process.cwd(), 'package.json'));

  let packageJsonPath: string;
  try {
    packageJsonPath = require.resolve('@storybook/react-native/package.json');
  } catch {
    throw new Error(missingStorybookReactNativePackage());
  }

  let installed: { version?: string };
  try {
    installed = await readJson(packageJsonPath);
  } catch {
    return;
  }

  const version = installed?.version ?? 'unknown';
  if (semver.valid(version) && semver.lt(version, MINIMUM_STORYBOOK_REACT_NATIVE_VERSION)) {
    throw new Error(unsupportedStorybookReactNativeVersion(version));
  }
}
