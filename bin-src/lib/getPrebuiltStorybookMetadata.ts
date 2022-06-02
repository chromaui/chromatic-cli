import { readFile } from 'jsonfile';
import { Context } from '../types';
import { supportedAddons } from './supportedAddons';
import { viewLayers } from './viewLayers';

/* 
  In Storybook 6.5+, when building a Storybook, a project.json file is generated,
  containing metadata (sb builder, addons, viewLayer and viewLayer version) for the 
  particular setup.
*/

export interface SBProjectJson {
  addons: Record<string, { version: string; options: any }>;
  builder?: {
    name: string;
  };
  framework: {
    name: string;
  };
  storybookPackages?: Record<string, { version: string }>;
}

export const getStorybookMetadataFromProjectJson = async (
  projectJsonPath: string
): Promise<Partial<Context['storybook']>> => {
  const sbProjectJson = (await readFile(projectJsonPath)) as SBProjectJson;
  const viewLayerPackage = Object.keys(viewLayers).find(
    (viewLayer) => viewLayers[viewLayer] === sbProjectJson.framework.name
  );
  return {
    viewLayer: sbProjectJson.framework.name ?? '',
    version: sbProjectJson.storybookPackages[viewLayerPackage].version,
    builder: sbProjectJson?.builder
      ? {
          name:
            typeof sbProjectJson.builder === 'string'
              ? sbProjectJson.builder
              : sbProjectJson?.builder.name,
        }
      : { name: 'webpack4' },
    addons: Object.keys(sbProjectJson.addons).map((addon) => ({
      name: supportedAddons[addon],
      packageName: addon,
      packageVersion: sbProjectJson.addons[addon].version,
    })),
  };
};
