import path from 'path';

import { Logger } from '../log';
import { readInstalledPackage, readInstalledVersion } from './readInstalledVersion';
import { isLegacyVersion, readStorybookVersion } from './storybookVersion';

/**
 * Reads the version of the Storybook the project's framework builds with, from where Node resolves
 * that framework. A monorepo can install Storybooks of different versions in different
 * `node_modules`, and the chain in `readStorybookVersion`, run from the config directory, can pick
 * one the build never loads, such as a newer `storybook` at the root over a package's own older
 * Storybook.
 *
 * - Storybook's own frameworks and renderers from before 8.2 are released with Storybook, so their
 *   version is Storybook's. They don't depend on `storybook`, so resolving it from them could find
 *   an unrelated copy.
 * - Any other framework, including third-party ones with their own versions, depends on
 *   `storybook`, so the chain runs from the framework's own directory.
 *
 * Without a framework, or when the framework doesn't resolve, the chain runs from the config
 * directory.
 *
 * @param log The logger to record a resolution failure with.
 * @param configDirectory The absolute Storybook config directory to resolve from.
 * @param framework The framework the main config names, if any: a package name such as
 * `@storybook/react-vite`, or the absolute directory `getAbsolutePath(...)` gives, which keeps the
 * installation the config selected.
 *
 * @returns The installed Storybook version, such as `9.1.20`.
 *
 * @throws {VersionNotFoundError} When no Storybook package resolves with a usable version.
 */
export function readFrameworkStorybookVersion(
  log: Logger,
  configDirectory: string,
  framework: string | undefined
): string {
  const readVersion = (fromDirectory: string, packageName: string) =>
    readInstalledVersion(log, fromDirectory, packageName);

  const installed = framework && readInstalledPackage(log, configDirectory, framework);
  if (installed) {
    if (installed.name?.startsWith('@storybook/') && isLegacyVersion(installed.version)) {
      return installed.version;
    }
    return readStorybookVersion(path.dirname(installed.packageJsonPath), readVersion);
  }

  return readStorybookVersion(configDirectory, readVersion);
}
