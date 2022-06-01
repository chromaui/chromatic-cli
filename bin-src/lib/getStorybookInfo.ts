import fs from 'fs-extra';
import path from 'path';

import { Context } from '../types';
import { getStorybookMetadataFromProjectJson } from './getPrebuiltStorybookMetadata';

import { getStorybookMetadata } from './getStorybookMetadata';

export default async function getStorybookInfo(
  ctx: Context
): Promise<Partial<Context['storybook']>> {
  try {
    if (ctx.options.storybookBuildDir) {
      const projectJsonPath = path.resolve(ctx.options.storybookBuildDir, 'project.json');
      // This test makes sure we fall through if the file does not exist.
      if (fs.pathExistsSync(projectJsonPath)) {
        return await getStorybookMetadataFromProjectJson(projectJsonPath);
      }
    }
    return await getStorybookMetadata(ctx);
  } catch (e) {
    ctx.log.debug(e);
    return { viewLayer: null, version: null, addons: [], builder: null };
  }
}
