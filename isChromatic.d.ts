/**
 * Checks if the current environment is running in Chromatic.
 *
 * @param window - The window object whose `navigator` and/or `location` is used to determine if running in Chromatic.
 *
 * @returns `true` if running within Chromatic, `false` otherwise.
 */
declare function isChromatic(window?: Window): boolean;
export = isChromatic;
