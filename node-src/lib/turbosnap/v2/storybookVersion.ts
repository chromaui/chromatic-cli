import semver from 'semver';

import { viewLayers } from '../../viewLayers';
import { ManifestInput } from './manifestInput';

// Storybook's own package. From 8.2 it is the core runtime and every framework and renderer lists it
// as a peer dependency, so a working install can always resolve it.
const STORYBOOK_PACKAGE = 'storybook';

// Before 8.2, `storybook` was only the CLI and projects often left it out. These packages ship with
// every 6.x to 8.1 install and are versioned in lockstep with it: the preview runtime (7.0 to 8.1),
// core-common (6.x to 8.1), then the renderers, one of which every project installs. Which of them a
// given install can resolve from the config directory depends on how it hoists.
const LEGACY_PACKAGES = [
  '@storybook/preview-api',
  '@storybook/core-common',
  ...Object.keys(viewLayers),
];

// The first version that requires `storybook`. A legacy package at this version or later means the
// install is missing `storybook`, or holds a stale copy, so its version can't stand in for one.
const STORYBOOK_REQUIRED_SINCE = '8.2.0';

function isLegacyVersion(version: string) {
  const coerced = semver.coerce(version);
  return !!coerced && semver.lt(coerced, STORYBOOK_REQUIRED_SINCE);
}

/**
 * Reads the installed Storybook version from the resolved Storybook package's own `package.json`.
 *
 * This backs the `storybookVersion` manifest entry, which gates recapture on a Storybook upgrade
 * that file hashing cannot see. The view layer (e.g. `@storybook/react`) is always bundled into the
 * preview, so it appears in `preview-stats.json` and a view-layer upgrade already changes the story
 * hashes. The core preview runtime is different: on some builder/version combinations it is served
 * as an externalized bundle (e.g. an `storybook/internal/*` bare specifier), so it never appears as
 * a hashable file in `preview-stats.json`. The version gate covers exactly that blind spot.
 *
 * We therefore do not reuse `ctx.storybook.version`: that reports the view-layer package. It also
 * resolves relative to the working directory without walking up to a hoisted install, and can be a
 * bare semver range rather than a concrete version.
 *
 * We resolve from the config directory, because that is the package directory that should've
 * been used to build the Storybook. It then walks up every ancestor `node_modules` to find the
 * first package it can resolve.
 *
 * An E2E build resolves its E2E package instead; see `resolveE2EPackageVersion`.
 *
 * @param input Where to resolve from and what to read the disk with.
 * @param input.configDir The absolute Storybook config directory to resolve from.
 * @param input.projectRoot The absolute project root an E2E package is resolved from.
 * @param input.e2ePackage The E2E package an E2E build uploads the Storybook of, if any.
 * @param input.projectFiles How to read the disk.
 *
 * @returns The installed Storybook version (e.g. `9.1.20`), or the E2E package and its version.
 */
export function resolveStorybookVersion(
  input: Pick<ManifestInput, 'configDir' | 'projectRoot' | 'e2ePackage' | 'projectFiles'>
): string {
  if (input.e2ePackage) {
    return resolveE2EPackageVersion(input.e2ePackage, input);
  }

  const version = input.projectFiles.packageVersion(input.configDir, STORYBOOK_PACKAGE);
  if (version) return version;

  for (const packageName of LEGACY_PACKAGES) {
    const legacyVersion = input.projectFiles.packageVersion(input.configDir, packageName);
    if (legacyVersion && isLegacyVersion(legacyVersion)) return legacyVersion;
  }

  // Without a version there is no gate on a Storybook upgrade, so refuse to build a manifest that
  // would silently under-capture. Not finding a Storybook dependency usually means nothing is
  // installed so we'll inform the customer accordingly.
  throw new Error(
    `Could not resolve a Storybook version from ${input.configDir}: neither ${STORYBOOK_PACKAGE} nor, for Storybook 8.1 and earlier, its preview, core or renderer packages could be resolved with a version. TurboSnap hashes installed dependencies, so they must be installed before running Chromatic, even for a prebuilt Storybook.`
  );
}

/**
 * Resolves `storybookVersion` for an E2E build; see `ManifestInput.e2ePackage`. The package's name
 * and version stand in, so a package upgrade changes the configuration like a Storybook upgrade does.
 * The Index only compares the value for equality.
 *
 * @param e2ePackage The E2E package, such as `@chromatic-com/vitest`.
 * @param input Where the package is installed and what to read the disk with.
 * @param input.projectRoot The absolute project root to resolve the package from.
 * @param input.projectFiles How to read the disk.
 *
 * @returns The package and its installed version (e.g. `@chromatic-com/vitest@1.0.2`).
 */
function resolveE2EPackageVersion(
  e2ePackage: string,
  input: Pick<ManifestInput, 'projectRoot' | 'projectFiles'>
): string {
  const version = input.projectFiles.packageVersion(input.projectRoot, e2ePackage);
  if (!version) {
    throw new Error(
      `Could not resolve a version of ${e2ePackage} from ${input.projectRoot}. TurboSnap hashes installed dependencies, so they must be installed before running Chromatic.`
    );
  }
  return `${e2ePackage}@${version}`;
}
