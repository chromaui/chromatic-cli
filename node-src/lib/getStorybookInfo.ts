import { pathExistsSync } from 'fs-extra';
import path from 'path';

import type { StorybookInfoDeps } from '../tasks/storybookInfo';
import { AbsolutePath, Storybook } from '../types';
import { getStorybookMetadataFromProjectJson } from './getPrebuiltStorybookMetadata';
import { getStorybookMetadata } from './getStorybookMetadata';

/**
 * Get Storybook information from the user's local project.
 *
 * @param deps Dependencies needed to detect Storybook metadata.
 * @param projectRoot The absolute Storybook project root the reported directories are relative to.
 *
 * @returns The resolved Storybook paths and any additional metadata we can find.
 */
export default async function getStorybookInfo(
  deps: StorybookInfoDeps,
  projectRoot: AbsolutePath
): Promise<Storybook> {
  try {
    if (deps.options.storybookBuildDir) {
      const projectJsonPath = path.resolve(deps.options.storybookBuildDir, 'project.json');
      // This test makes sure we fall through if the file does not exist.
      if (pathExistsSync(projectJsonPath)) {
        // Reading the source config is best-effort: a prebuilt Storybook may not ship one, and its
        // failure must not stop us reading project.json.
        let sourceMetadata: Partial<Omit<Storybook, 'projectRoot'>> = {};
        try {
          sourceMetadata = await getStorybookMetadata(deps, projectRoot);
        } catch (err) {
          deps.log.debug(err);
        }

        /*
          This await is needed in order to for the catch block
          to get the result in the case that this function fails.
        */
        const prebuiltMetadata = await getStorybookMetadataFromProjectJson(projectJsonPath);
        return withResolvedPaths({ ...sourceMetadata, ...prebuiltMetadata }, projectRoot);
      }
    }
    // Same for this await.
    return withResolvedPaths(await getStorybookMetadata(deps, projectRoot), projectRoot);
  } catch (err) {
    deps.log.debug(err);
    return withResolvedPaths({}, projectRoot);
  }
}

function withResolvedPaths(
  discovered: Partial<Omit<Storybook, 'projectRoot'>>,
  projectRoot: AbsolutePath
): Storybook {
  return {
    ...discovered,
    projectRoot,
    configDir: discovered.configDir ?? path.resolve(projectRoot, '.storybook'),
    staticDirs: discovered.staticDirs ?? [],
  };
}
