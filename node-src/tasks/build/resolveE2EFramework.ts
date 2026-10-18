import { Context } from '../../types';

/**
 * Picks the E2E framework a build targets from the CLI options, defaulting to Cypress.
 *
 * @param options The CLI options.
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
