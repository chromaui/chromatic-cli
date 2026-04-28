import getStorybookInfo from '../getStorybookInfo';
import { StorybookDetector } from './storybookDetector';

/**
 * Construct the production {@link StorybookDetector} backed by the existing
 * `lib/getStorybookInfo` module. The adapter is a thin passthrough.
 *
 * @returns A StorybookDetector that delegates to `getStorybookInfo`.
 */
export function createRealStorybookDetector(): StorybookDetector {
  return { detect: getStorybookInfo };
}
