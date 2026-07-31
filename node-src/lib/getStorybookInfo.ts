import { pathExistsSync } from 'fs-extra';
import path from 'path';

import type { StorybookInfoDeps } from '../tasks/storybookInfo';
import { Storybook } from '../types';
import { getStorybookMetadataFromProjectJson } from './getPrebuiltStorybookMetadata';
import { getStorybookMetadata } from './getStorybookMetadata';

/**
 * Get Storybook information from the user's local project.
 *
 * @param deps Dependencies needed to detect Storybook metadata.
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
          These awaits are needed in order to for the catch block
          to get the result in the case that either function fails.
        */
        const [sourceMetadata, prebuiltMetadata] = await Promise.all([
          // Reading the source config is best-effort: a prebuilt Storybook may not ship one, and its
          // failure must not stop us reading project.json.
          getStorybookMetadata(deps).catch((err): Partial<Storybook> => {
            deps.log.debug(err);
            return {};
          }),
          getStorybookMetadataFromProjectJson(projectJsonPath),
        ]);
        // The prebuilt project.json wins: it records what the Storybook was actually built with.
        return { ...sourceMetadata, ...prebuiltMetadata };
      }
    }
    // Same for this await.
    return await getStorybookMetadata(deps);
  } catch (err) {
    deps.log.debug(err);
    return {};
  }
}
