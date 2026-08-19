/**
 * The synthetic keys in the manifest's `storybookConfigHashes` map. They share one namespace and one
 * invariant, so they are declared together: a canonical relative path always starts with `./` or
 * `../`, so none of these bare names can collide with a real file.
 */

/**
 * Every `<configDir>/preview.*` subtree, unioned and rolled up; see {@link collectStorybookFiles}.
 * One category entry rather than one entry per preview path, so the map stays a homogeneous set of
 * category roll-ups.
 */
export const STORYBOOK_PREVIEW_KEY = 'preview';

/** Every orphan global, rolled up; see {@link collectStorybookFiles}. */
export const STORYBOOK_GLOBALS_KEY = 'storybookGlobals';

/**
 * The installed Storybook version. Unlike every other entry this is a version string rather than a
 * hash, because the preview core runtime is served outside the module graph on webpack and rspack;
 * see {@link resolveStorybookVersion}.
 */
export const STORYBOOK_VERSION_KEY = 'storybookVersion';

/**
 * The Storybook config directory and the static directories: Storybook inputs that are never bundler
 * inputs, so no module hash can see them change.
 *
 * `package.json` and lockfiles deliberately have no key here, even though they are also not modules.
 * v1 diffed them only to derive changed package *names*; v2 content-hashes the installed files that
 * are in the graph, which covers a dependency change more precisely. Hashing manifest bytes on top
 * would recapture everything on lockfile churn that v1 correctly captures nothing for.
 */
export const STORYBOOK_CONFIG_KEY = 'storybookConfigFiles';

/** The static directories; see {@link STORYBOOK_CONFIG_KEY}. */
export const STATIC_FILES_KEY = 'staticFiles';

/**
 * Every synthetic key in `storybookConfigHashes`. A canonical file path always starts `./` or `../`,
 * so none of these bare names can collide with one; see the note at the top of this file.
 */
export type StorybookFileKey =
  | typeof STORYBOOK_PREVIEW_KEY
  | typeof STORYBOOK_GLOBALS_KEY
  | typeof STORYBOOK_VERSION_KEY
  | typeof STORYBOOK_CONFIG_KEY
  | typeof STATIC_FILES_KEY;
