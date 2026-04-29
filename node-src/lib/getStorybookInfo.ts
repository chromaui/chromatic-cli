import { pathExistsSync } from 'fs-extra';
import path from 'path';

import { Deps, Storybook } from '../types';
import { getStorybookMetadataFromProjectJson } from './getPrebuiltStorybookMetadata';
import { getStorybookMetadata } from './getStorybookMetadata';

type StorybookInfoDeps = Pick<Deps, 'env' | 'log' | 'options' | 'packageJson'>;

/**
 * Get Storybook information from the user's local project.
 *
 * @param deps Narrow dependencies needed to detect Storybook metadata.
 *
 * @returns Any Storybook information we can find from the user's local project (which may be
 * nothing).
 */
export default async function getStorybookInfo(
  deps: StorybookInfoDeps
): Promise<Partial<Storybook>> {
  try {
    if (deps.options.storybookBuildDir) {
      const projectJsonPath = path.resolve(deps.options.storybookBuildDir, 'project.json');
      // This test makes sure we fall through if the file does not exist.
      if (pathExistsSync(projectJsonPath)) {
        /*
          This await is needed in order to for the catch block
          to get the result in the case that this function fails.
        */
        return await getStorybookMetadataFromProjectJson(projectJsonPath);
      }
    }
    // Same for this await.
    return await getStorybookMetadata(deps);
  } catch (err) {
    deps.log.debug(err);
    return {};
  }
}
