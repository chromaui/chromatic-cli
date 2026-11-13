import semver from 'semver';

import { ManifestInput } from './manifestInput';

// The packages that own Storybook's preview runtime, most-preferred first. All report the same
// lockstep version when present; the order is about which one a given install can resolve.
const STORYBOOK_CORE_PACKAGES = [
  'storybook', // the meta-package, when the project can resolve it
  '@storybook/core', // the core package it wraps; reachable under strict installs (pnpm, PnP) where the meta-package isn't
  // Storybook 6, which has no meta-package and can nest `@storybook/core` under the renderer. It
  // first shipped in 6.2, so 6.0 and 6.1 installs still fail to resolve a version.
  '@storybook/core-common',
];

// `@storybook/core-common` also exists for Storybook 7 and 8, so on a newer install a stale hoisted
// copy could answer with the wrong version. A wrong version silently skips recapture after an
// upgrade, which is worse than failing, so only trust it for the Storybook 6 case it is here for.
function isTrustedVersion(packageName: string, version: string) {
  return packageName !== '@storybook/core-common' || semver.major(version) === 6;
}

/**
 * Reads the installed Storybook version from the resolved core package's own `package.json`.
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

  for (const packageName of STORYBOOK_CORE_PACKAGES) {
    const version = input.projectFiles.packageVersion(input.configDir, packageName);
    if (version && isTrustedVersion(packageName, version)) {
      return version;
    }
  }

  // Without a version there is no gate on a Storybook upgrade, so refuse to build a manifest that
  // would silently under-capture. Not finding a Storybook dependency usually means nothing is
  // installed so we'll inform the customer accordingly.
  throw new Error(
    `Could not resolve a Storybook version from ${input.configDir}: none of ${STORYBOOK_CORE_PACKAGES.join(', ')} could be resolved with a version. TurboSnap hashes installed dependencies, so they must be installed before running Chromatic, even for a prebuilt Storybook.`
  );
}

/**
 * Resolves `storybookVersion` for an E2E build; see `ManifestInput.e2ePackage`. The package's name
 * and version stand in, so a package upgrade recaptures like a Storybook upgrade does. The Index only
 * compares the value for equality.
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
