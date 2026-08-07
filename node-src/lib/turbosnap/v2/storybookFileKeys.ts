/**
 * The synthetic keys in the manifest's `storybookFiles` map. They share one namespace and one
 * invariant, so they are declared together: a canonical relative path always starts with `./` or
 * `../`, so none of these bare names can collide with a real file.
 */

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
export const STORYBOOK_CONFIG_KEY = 'storybookConfig';

/** The static directories; see {@link STORYBOOK_CONFIG_KEY}. */
export const STATIC_FILES_KEY = 'staticFiles';
