import semver from 'semver';

import { viewLayers } from '../viewLayers';

// Storybook's own package. From 8.2 it is the core runtime and every framework and renderer lists it
// as a peer dependency, so a working install can always resolve it.
const STORYBOOK_PACKAGE = 'storybook';

// The core package `storybook` wraps from 8.2 to 8.6, reachable under strict installs where
// `storybook` isn't. Storybook 6 also has one, at its own version.
const STORYBOOK_CORE_PACKAGE = '@storybook/core';

// Before 8.2, `storybook` was only the CLI and projects often left it out. These packages ship with
// every 6.x to 8.1 install and are versioned in lockstep with it: the preview runtime (7.0 to 8.1),
// core-common (6.x to 8.1), then the renderer and framework packages in `viewLayers`, one of which
// every project installs. Which of them a given install can resolve from the config directory
// depends on how it hoists.
const LEGACY_PACKAGES = [
  '@storybook/preview-api',
  '@storybook/core-common',
  ...Object.keys(viewLayers),
];

// The first version that requires `storybook`. A legacy package at this version or later means the
// install is missing `storybook`, or holds a stale copy, so its version can't stand in for one.
const STORYBOOK_REQUIRED_SINCE = '8.2.0';

/**
 * Thrown when no version can be resolved, which comes down to how the project is installed: nothing
 * installed, Yarn Plug'n'Play without its runtime, or Storybook out of reach of the config
 * directory.
 */
export class VersionNotFoundError extends Error {
  readonly name = 'VersionNotFoundError';
}

function isLegacyVersion(version: string) {
  const coerced = semver.coerce(version);
  return !!coerced && semver.lt(coerced, STORYBOOK_REQUIRED_SINCE);
}

/**
 * Reads the installed Storybook version from the resolved Storybook package's own `package.json`.
 *
 * We resolve from the config directory, because that is the package directory that should've
 * been used to build the Storybook.
 *
 * @param configDirectory The absolute Storybook config directory to resolve from.
 * @param readVersion Reads a package's installed version, resolved from a directory, or returns
 * undefined when it can't.
 *
 * @returns The installed Storybook version, such as `9.1.20`.
 *
 * @throws {VersionNotFoundError} When no Storybook package resolves with a usable version.
 */
export function readStorybookVersion(
  configDirectory: string,
  readVersion: (fromDirectory: string, packageName: string) => string | undefined
): string {
  const version =
    readVersion(configDirectory, STORYBOOK_PACKAGE) ??
    readVersion(configDirectory, STORYBOOK_CORE_PACKAGE);
  if (version) return version;

  // Trusted only when every one that resolves is from before 8.2: a newer one means this is an 8.2+
  // install missing `storybook`, and an older one beside it is a stale copy from somewhere else.
  const legacyVersions = LEGACY_PACKAGES.map((packageName) =>
    readVersion(configDirectory, packageName)
  ).filter((version) => version !== undefined);
  if (legacyVersions.length > 0 && legacyVersions.every((version) => isLegacyVersion(version))) {
    return legacyVersions[0];
  }

  throw new VersionNotFoundError(
    `Could not resolve a Storybook version from ${configDirectory}: neither ${STORYBOOK_PACKAGE}, ${STORYBOOK_CORE_PACKAGE} nor, for Storybook 8.1 and earlier, its preview, core or renderer packages could be resolved with a version. TurboSnap hashes installed dependencies, so they must be installed before running Chromatic, even for a prebuilt Storybook. From Storybook 8.2, storybook must also be a dependency of this project.`
  );
}
