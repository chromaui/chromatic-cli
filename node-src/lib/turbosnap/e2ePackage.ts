import { resolveE2EFramework } from '../../tasks/build/resolveE2EFramework';
import { Options } from '../../types';
import { isE2EBuild } from '../e2eUtils';

/**
 * Names the package whose bundled Storybook an E2E build uploads, the same package the build step
 * runs `build-archive-storybook` from. That Storybook renders every snapshot, so an upgrade can
 * change all of them: TurboSnap 1.0 bails when it changes, and TurboSnap 2.0, which runs on Vitest
 * builds but not Playwright or Cypress ones, tracks its version as `storybookVersion`.
 *
 * @param options The E2E flags of the build.
 *
 * @returns The package, such as `@chromatic-com/vitest`, or `undefined` for a Storybook build.
 */
export function getE2EPackage(
  options: Partial<Pick<Options, 'playwright' | 'cypress' | 'vitest'>>
) {
  return isE2EBuild(options) ? `@chromatic-com/${resolveE2EFramework(options)}` : undefined;
}
