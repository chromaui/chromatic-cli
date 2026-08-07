import { ProjectFiles } from './projectFiles';

// The packages that own Storybook's preview runtime, newest layout first: Storybook >= 9 ships it in
// `storybook`, Storybook 8 in `@storybook/core`. If a future major moves the runtime into some other
// package, prepend it here.
const STORYBOOK_CORE_PACKAGES = ['storybook', '@storybook/core'];

/**
 * Reads the installed Storybook version from the resolved core package's own `package.json`.
 *
 * This backs the `storybookVersion` manifest entry, which exists because the preview core runtime
 * is served *outside* the module graph on webpack and rspack: it is externalized to
 * `__STORYBOOK_MODULE_*__` globals and loaded from a prebuilt `sb-preview/runtime.js`, so it never
 * appears in `preview-stats.json` and content hashing cannot see it. Tracking the version means a
 * Storybook upgrade still forces a recapture.
 *
 * We track only the core package, not every `@storybook/*` version: everything else that executes in
 * the preview is in the module graph and hashed by content, so a wider list would over-capture on
 * addon-only bumps that cannot change a snapshot. That relies on the runtime shipping from the core
 * package, and a future major moving it would break coverage silently — prepend the new package above
 * if that happens.
 *
 * Emitted on every builder, including vite, where the runtime is bundled into the graph and content
 * hashing already covers it: one unconditional entry beats a per-builder branch.
 *
 * We deliberately do not reuse `ctx.storybook.version`: that reports the *view layer* package (e.g.
 * `@storybook/react`), resolves it relative to the working directory without walking up to a hoisted
 * install, and can be a bare semver range rather than a concrete version.
 *
 * @param projectRoot The absolute Storybook project root to resolve from.
 * @param projectFiles How to read the disk.
 *
 * @returns The installed Storybook version (e.g. `9.1.20`).
 */
export function resolveStorybookVersion(projectRoot: string, projectFiles: ProjectFiles): string {
  for (const packageName of STORYBOOK_CORE_PACKAGES) {
    const version = projectFiles.packageVersion(projectRoot, packageName);
    if (version) return version;
  }

  // Without a version there is no gate on a Storybook upgrade, so refuse to build a manifest that
  // would silently under-capture. The caller in lib/turbosnap/index.ts falls back to TurboSnap v1.
  throw new Error(
    `Could not resolve a Storybook version from ${projectRoot}: none of ${STORYBOOK_CORE_PACKAGES.join(', ')} could be resolved with a version.`
  );
}
