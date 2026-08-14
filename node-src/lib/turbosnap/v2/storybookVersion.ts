import { AbsolutePath } from '../../../types';
import { ProjectFiles } from './projectFiles';

// The packages that own Storybook's preview runtime, most-preferred first. Both report the same
// lockstep version when present; the order is about which one a given install can resolve.
const STORYBOOK_CORE_PACKAGES = [
  'storybook', // the meta-package, when the project can resolve it
  '@storybook/core', // the core package it wraps; reachable under strict installs (pnpm, PnP) where the meta-package isn't
];

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
 * @param projectRoot The absolute Storybook project root to resolve from.
 * @param projectFiles How to read the disk.
 *
 * @returns The installed Storybook version (e.g. `9.1.20`).
 */
export function resolveStorybookVersion(
  projectRoot: AbsolutePath,
  projectFiles: ProjectFiles
): string {
  for (const packageName of STORYBOOK_CORE_PACKAGES) {
    const version = projectFiles.packageVersion(projectRoot, packageName);
    if (version) {
      return version;
    }
  }

  // Without a version there is no gate on a Storybook upgrade, so refuse to build a manifest that
  // would silently under-capture.
  throw new Error(
    `Could not resolve a Storybook version from ${projectRoot}: none of ${STORYBOOK_CORE_PACKAGES.join(', ')} could be resolved with a version.`
  );
}
