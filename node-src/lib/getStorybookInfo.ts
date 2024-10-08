import { pathExistsSync } from 'fs-extra';
import path from 'path';

import { Context } from '../types';
import { getStorybookMetadataFromProjectJson } from './getPrebuiltStorybookMetadata';
import { getStorybookMetadata } from './getStorybookMetadata';

/**
 * Get Storybook information from the user's local project.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns Any Storybook information we can find from the user's local project (which may be
 * nothing).
 */
export default async function getStorybookInfo(
  ctx: Context
): Promise<Partial<Context['storybook']>> {
  try {
    if (ctx.options.storybookBuildDir) {
      const projectJsonPath = path.resolve(ctx.options.storybookBuildDir, 'project.json');
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
    return await getStorybookMetadata(ctx);
  } catch (err) {
    ctx.log.debug(err);
    return {};
  }
}
