import semver from 'semver';

import missingStorybookReactNativePackage from '../../ui/messages/errors/missingStorybookReactNativePackage';
import unsupportedStorybookReactNativeVersion from '../../ui/messages/errors/unsupportedStorybookReactNativeVersion';
import { resolvePackageJson } from '../getStorybookMetadata';

export const MINIMUM_STORYBOOK_REACT_NATIVE_VERSION = '9.0.0';

/**
 * Ensures the installed `@storybook/react-native` package meets Chromatic's minimum supported
 * version. Throws a clear error if the package is missing or below the minimum so the build can
 * exit before running into less actionable downstream errors.
 */
export async function validateStorybookReactNativeVersion(): Promise<void> {
  let installed: { version?: string } | undefined;
  try {
    installed = await resolvePackageJson('@storybook/react-native');
  } catch {
    throw new Error(missingStorybookReactNativePackage());
  }

  const version = installed?.version;
  if (!version || !semver.gte(version, MINIMUM_STORYBOOK_REACT_NATIVE_VERSION)) {
    throw new Error(unsupportedStorybookReactNativeVersion(version ?? 'unknown'));
  }
}
