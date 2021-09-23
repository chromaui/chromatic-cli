import execa from 'execa';

import { viewLayers } from './viewLayers';
import { supportedAddons } from './supportedAddons';

export const getInstalledStorybookInfo = async () => {
  const { all } = await execa.command('yarn list --pattern @storybook/ --json', {
    env: {},
    timeout: 10000,
    all: true,
    shell: true,
  });

  const { data } = JSON.parse(all as any);
  const trees: { name: string; version: string }[] = data.trees.map((p: any) => {
    const [, name, version] = p.name.match(/(.+)@(.+)/);
    return { name, version };
  });

  const viewLayer = trees.find(({ name }) => viewLayers[name]);
  const addons = trees.filter(({ name }) => supportedAddons[name]);

  const result = {
    viewLayer: viewLayers[viewLayer ? viewLayer.name : ''],
    version: viewLayer ? viewLayer.version : undefined,
    addons: addons.map((a) => ({ ...a, packageName: a.name, name: supportedAddons[a.name] })),
  };

  return result;
};
