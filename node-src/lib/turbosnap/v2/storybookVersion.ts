import semver from 'semver';

import { ManifestInput } from './manifestInput';

// The packages that own Storybook's preview runtime, most-preferred first. Both report the same
// lockstep version when present; the order is about which one a given install can resolve.
const STORYBOOK_CORE_PACKAGES = [
  'storybook', // the meta-package, when the project can resolve it
  '@storybook/core', // the core package it wraps; reachable under strict installs (pnpm, PnP) where the meta-package isn't
];

/**
 * Reads the installed Storybook version from the resolved core package's own `package.json`.
 *
 * This backs the `storybookVersion` manifest entry, which gates recapture on a Storybook upgrade.
 *
 * We resolve from the config directory, because that is the package directory that should've
 * been used to build the Storybook. It then walks up every ancestor `node_modules` to find the
 * first package it can resolve.
 *
 * When no install resolves (e.g. a prebuilt Storybook uploaded without `node_modules`), we fall back
 * to the version the CLI already detected, but only when it is a concrete version.
 *
 * When no version can be resolved, we throw an error to avoid silently under-capturing.
 *
 * @param input Where to resolve from and what to read the disk with.
 * @param input.configDir The absolute Storybook config directory to resolve from.
 * @param input.projectFiles How to read the disk.
 * @param input.storybookVersion The version the CLI already detected, used as a last resort.
 *
 * @returns The installed Storybook version (e.g. `9.1.20`).
 */
export function resolveStorybookVersion(
  input: Pick<ManifestInput, 'configDir' | 'projectFiles' | 'storybookVersion'>
): string {
  for (const packageName of STORYBOOK_CORE_PACKAGES) {
    const version = input.projectFiles.packageVersion(input.configDir, packageName);
    if (version) {
      return version;
    }
  }

  if (input.storybookVersion && semver.valid(input.storybookVersion)) {
    return input.storybookVersion;
  }

  // Without a version there is no gate on a Storybook upgrade, so refuse to build a manifest that
  // would silently under-capture.
  throw new Error(
    `Could not resolve a Storybook version from ${input.configDir}: none of ${STORYBOOK_CORE_PACKAGES.join(', ')} could be resolved with a version, and ${describeDetectedVersion(input.storybookVersion)}.`
  );
}

function describeDetectedVersion(storybookVersion?: string): string {
  return storybookVersion
    ? `the CLI detected \`${storybookVersion}\`, which is not a concrete version`
    : 'the CLI did not detect one';
}
