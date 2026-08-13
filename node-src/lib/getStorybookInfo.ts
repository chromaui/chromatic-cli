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
  const sourceMetadata = await readSourceMetadata(deps, projectRoot);

  const projectJsonPath =
    deps.options.storybookBuildDir && path.resolve(deps.options.storybookBuildDir, 'project.json');

  // A prebuilt Storybook may not ship a project.json, in which case the source config is all we have.
  if (!projectJsonPath || !pathExistsSync(projectJsonPath)) {
    return withResolvedPaths(sourceMetadata, deps, projectRoot);
  }

  try {
    // project.json describes the build we are actually uploading, so it wins over the source config.
    const prebuiltMetadata = await getStorybookMetadataFromProjectJson(projectJsonPath);
    return withResolvedPaths({ ...sourceMetadata, ...prebuiltMetadata }, deps, projectRoot);
  } catch (err) {
    // If we fail to read the project.json, we continue with the source config instead of dropping
    // everything.
    deps.log.debug(err);
    return withResolvedPaths(sourceMetadata, deps, projectRoot);
  }
}

async function readSourceMetadata(
  deps: StorybookInfoDeps,
  projectRoot: AbsolutePath
): Promise<Partial<Omit<Storybook, 'projectRoot'>>> {
  try {
    return await getStorybookMetadata(deps, projectRoot);
  } catch (err) {
    deps.log.debug(err);
    return {};
  }
}

function withResolvedPaths(
  discovered: Partial<Omit<Storybook, 'projectRoot'>>,
  deps: StorybookInfoDeps,
  projectRoot: AbsolutePath
): Storybook {
  return {
    ...discovered,
    projectRoot,
    configDir:
      discovered.configDir ??
      path.resolve(projectRoot, deps.options.storybookConfigDir ?? '.storybook'),
    staticDirs: discovered.staticDirs ?? [],
  };
}
