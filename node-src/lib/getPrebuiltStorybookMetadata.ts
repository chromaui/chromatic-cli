import { readFile } from 'jsonfile';
import { Context } from '../types';
import { builders } from './builders';
import { supportedAddons } from './supportedAddons';
import { viewLayers } from './viewLayers';

/*
  In Storybook 6.5+, when building a Storybook, a project.json file is generated,
  containing metadata (sb builder, addons, viewLayer and viewLayer version) for the
  particular setup.
*/

export interface SBProjectJson {
  addons: Record<string, { version: string; options: any }>;
  builder?: string;
  framework: {
    name: string;
  };
  storybookVersion: string;
  storybookPackages?: Record<string, { version: string }>;
}

const getBuilder = (sbProjectJson: SBProjectJson): { name: string; packageVersion: string } => {
  const { builder, storybookPackages, storybookVersion } = sbProjectJson;
  return builder
    ? {
        name: builder,
        packageVersion: storybookPackages[builders[builder]].version,
      }
    : {
        name: 'webpack4', // the default builder for Storybook v6
        packageVersion: storybookVersion,
      };
};

export const getStorybookMetadataFromProjectJson = async (
  projectJsonPath: string
): Promise<Partial<Context['storybook']>> => {
  const sbProjectJson = (await readFile(projectJsonPath)) as SBProjectJson;
  const viewLayerPackage = Object.keys(viewLayers).find(
    (viewLayer) => viewLayers[viewLayer] === sbProjectJson.framework.name
  );
  const builder = getBuilder(sbProjectJson);

  return {
    viewLayer: sbProjectJson.framework.name ?? null,
    version: sbProjectJson.storybookPackages[viewLayerPackage].version ?? null,
    builder,
    addons: Object.entries(sbProjectJson.addons)
      .filter(([packageName]) => supportedAddons[packageName])
      .map(([packageName, addon]) => ({
        name: supportedAddons[packageName],
        packageName,
        packageVersion: addon.version,
      })),
  };
};
