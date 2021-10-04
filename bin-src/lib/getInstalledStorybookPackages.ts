import execa from 'execa';

import { viewLayers } from './viewLayers';
import { supportedAddons } from './supportedAddons';
import { timeout, raceFulfilled } from './promises';

export const getInstalledStorybookInfoYarn1 = async () => {
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

  let result;

  if (viewLayer) {
    result = {
      viewLayer: viewLayers[viewLayer.name],
      version: viewLayer.version,
      addons: addons.map((a) => ({
        packageVersion: a.version,
        packageName: a.name,
        name: supportedAddons[a.name],
      })),
    };
  }

  return result;
};

const lookupPackage = async (
  key: string
): Promise<{
  name: string;
  version: string;
}> => {
  const { all } = await execa.command(`yarn why ${key}`, {
    env: {},
    timeout: 10000,
    all: true,
    shell: true,
  });

  const matcher = new RegExp(`${key}.*(\\d\\.\\d\\.\\d)`);
  const [, extracted] = all.match(matcher);

  return {
    name: key,
    version: extracted,
  };
};

export const getInstalledStorybookInfoYarnBerry = async (ctx) => {
  const viewLayer = await Promise.race([
    raceFulfilled(Object.keys(viewLayers).map(lookupPackage)),
    timeout(10000),
  ]);

  if (!viewLayer) {
    throw new Error('no viewlayer!');
  }

  const addons = (
    await Promise.all(Object.keys(supportedAddons).map((k) => lookupPackage(k).catch((e) => null)))
  )
    .filter(Boolean)
    .map((a) => ({
      packageVersion: a.version,
      packageName: a.name,
      name: supportedAddons[a.name],
    }));

  const result = {
    viewLayer: viewLayers[viewLayer.name],
    version: viewLayer.version,
    addons,
  };

  return result;
};
