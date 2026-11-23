import { readStorybookVersion, VersionNotFoundError } from '../../installedPackages';
import { ManifestInput } from './manifestInput';

/**
 * Resolves the `storybookVersion` manifest entry: the installed Storybook version, read from the
 * config directory by `readStorybookVersion`.
 *
 * This entry gates recapture on a Storybook upgrade that file hashing cannot see. The view layer
 * (e.g. `@storybook/react`) is always bundled into the preview, so it appears in `preview-stats.json`
 * and a view-layer upgrade already changes the story hashes. The core preview runtime is different:
 * on some builder/version combinations it is served as an externalized bundle (e.g. an
 * `storybook/internal/*` bare specifier), so it never appears as a hashable file in
 * `preview-stats.json`. The version gate covers exactly that blind spot.
 *
 * We therefore do not reuse `ctx.storybook.version`: that reports the view-layer package. It also
 * resolves relative to the working directory without walking up to a hoisted install, and can be a
 * bare semver range rather than a concrete version.
 *
 * Without a version there is no gate on a Storybook upgrade, so this refuses to build a manifest
 * that would silently under-capture.
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
 *
 * @throws {VersionNotFoundError} When no version can be resolved.
 */
export function resolveStorybookVersion(
  input: Pick<ManifestInput, 'configDir' | 'projectRoot' | 'e2ePackage' | 'projectFiles'>
): string {
  if (input.e2ePackage) {
    return resolveE2EPackageVersion(input.e2ePackage, input);
  }

  return readStorybookVersion(input.configDir, input.projectFiles.packageVersion);
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
    throw new VersionNotFoundError(
      `Could not resolve a version of ${e2ePackage} from ${input.projectRoot}. TurboSnap hashes installed dependencies, so they must be installed before running Chromatic.`
    );
  }
  return `${e2ePackage}@${version}`;
}
