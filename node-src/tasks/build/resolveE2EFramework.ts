import { Context } from '../../types';

/**
 * Pick the E2E framework to build with: Playwright or Vitest when flagged, otherwise Cypress.
 *
 * @param options Resolved user options, read for the `--playwright` and `--vitest` flags.
 *
 * @returns The E2E framework name.
 */
export function resolveE2EFramework(options: Context['options']) {
  if (options.playwright) {
    return 'playwright';
  }

  if (options.vitest) {
    return 'vitest';
  }

  return 'cypress';
}
