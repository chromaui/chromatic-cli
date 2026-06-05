/**
 * Constants related to git and git configuration.
 */

// The minimum number of seconds that a customer can set the git timeout to. This prevents customers from setting it
// too low, which could cause issues with the build process.
export const MINIMUM_GIT_TIMEOUT_SECONDS = 1;

// The default number of seconds that the git timeout is set to. This is used when no timeout is specified by the
// customer.
export const DEFAULT_GIT_TIMEOUT_SECONDS = 20;

// Default timeout for git commands that are not necessary for the build to succeed. Please note that, unlike the
// previous constant, this timeout is in MILLISECONDS.
export const DEFAULT_METADATA_GIT_TIMEOUT_MILLISECONDS = 5000;
