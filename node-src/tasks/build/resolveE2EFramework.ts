import { Context } from '../../types';

/**
 * Resolve which E2E framework the build integrates with, preferring an explicit option.
 *
 * @param options Resolved user options, consulted for an explicit Playwright or Vitest choice.
 *
 * @returns The name of the E2E framework to use.
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
