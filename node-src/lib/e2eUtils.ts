import { Options } from '../types';

/**
 * Determine if the build is an E2E build.
 *
 * @param options Parsed options when executing the CLI (usually from the context).
 *
 * @returns true if the build is an E2E build.
 */
export function isE2EBuild(options: Partial<Pick<Options, 'playwright' | 'cypress' | 'vitest'>>) {
  return options.playwright || options.cypress || options.vitest;
}
