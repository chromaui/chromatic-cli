import { readFile } from 'jsonfile';
import { Context } from '../types';
import { builders } from './builders';
import { supportedAddons } from './supportedAddons';
import { viewLayers } from './viewLayers';
import packageDoesNotExist from '../ui/messages/errors/noViewLayerPackage';
import { resolvePackageJson } from './getStorybookMetadata';
import { timeout } from './promises';

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
  storybookVersion: string;
  storybookPackages?: Record<string, { version: string }>;
}

const getBuilder = (sbProjectJson: SBProjectJson): { name: string; packageVersion: string } => {
  let name: string;
  if (sbProjectJson.builder) {
    const { builder } = sbProjectJson;
    name = sbProjectJson.builder.name;
    return {
      name,
      packageVersion: sbProjectJson.storybookPackages[builders[name]].version,
    };
  }

  // Storybook uses Webpack4 if no builder is explicitly set.
  return {
    name: 'webpack4',
    packageVersion: sbProjectJson.storybookVersion,
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
    addons: Object.keys(sbProjectJson.addons).map((addon) => ({
      name: supportedAddons[addon],
      packageName: addon,
      packageVersion: sbProjectJson.addons[addon].version,
    })),
  };
};
