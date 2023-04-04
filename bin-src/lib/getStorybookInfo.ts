import fs from 'fs-extra';
import path from 'path';

import { Context } from '../types';
import { getStorybookMetadataFromProjectJson } from './getPrebuiltStorybookMetadata';

import { getStorybookMetadata } from './getStorybookMetadata';

export default async function getStorybookInfo(
  ctx: Context
): Promise<Partial<Context['storybook']>> {
  try {
    ctx.log.debug('getStorybookInfo', ctx.packageJson);
    ctx.log.debug('getStorybookInfo options', ctx.options);
    if (ctx.options.storybookBuildDir) {
      const projectJsonPath = path.resolve(ctx.options.storybookBuildDir, 'project.json');
      // This test makes sure we fall through if the file does not exist.
      if (fs.pathExistsSync(projectJsonPath)) {
        /* 
          This await is needed in order to for the catch block 
          to get the result in the case that this function fails.
        */
        return await getStorybookMetadataFromProjectJson(projectJsonPath, ctx);
      }
    }
    // Same for this await.
    return await getStorybookMetadata(ctx);
  } catch (e) {
    ctx.log.debug(e);
    return { viewLayer: null, version: null, addons: [], builder: null };
  }
}
