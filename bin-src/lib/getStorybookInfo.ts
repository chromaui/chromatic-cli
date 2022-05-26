import fs from 'fs-extra';
import meow from 'meow';
import { parseArgsStringToArgv } from 'string-argv';
import semver from 'semver';
import execa from 'execa';

import noViewLayerPackage from '../ui/messages/errors/noViewLayerPackage';
import { viewLayers } from './viewLayers';
import { supportedAddons } from './supportedAddons';
import { timeout, raceFulfilled } from './promises';
import { Context } from '../types';

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
    addons: addons.map((a) => ({
      packageVersion: a.version,
      packageName: a.name,
      name: supportedAddons[a.name],
    })),
  };

  return result;
};

const resolvePackageJson = (pkg: string) => {
  try {
    // we bundle this app for node, meaning all require calls are replaced by webpack.
    // in this case we want to use node's actual require functionality!
    // webpack will provide a '__non_webpack_require__' function to do this with,
    // but this will obviously not be present during tests, hence the check and fallback to the normal require
    const r = typeof __non_webpack_require__ !== 'undefined' ? __non_webpack_require__ : require;
    const path = r.resolve(`${pkg}/package.json`);
    return fs.readJson(path);
  } catch (error) {
    return Promise.reject(error);
  }
};

const findDependency = (
  { dependencies, devDependencies, peerDependencies },
  predicate: Parameters<typeof Array.prototype.find>[0]
) => [
  Object.entries(dependencies || {}).find(predicate),
  Object.entries(devDependencies || {}).find(predicate),
  Object.entries(peerDependencies || {}).find(predicate),
];

const findViewlayer = async ({ env, log, options, packageJson }) => {
  // Allow setting Storybook version via CHROMATIC_STORYBOOK_VERSION='@storybook/react@4.0-alpha.8' for unusual cases
  if (env.CHROMATIC_STORYBOOK_VERSION) {
    const [, p, v] = env.CHROMATIC_STORYBOOK_VERSION.match(/(.+)@(.+)$/) || [];
    const version = semver.valid(v) || semver.validRange(v); // ensures we get a specific version, not a range

    if (!p || !version) {
      throw new Error(
        'Invalid CHROMATIC_STORYBOOK_VERSION; expecting something like "@storybook/react@6.2.0".'
      );
    }
    const viewLayer = viewLayers[p] || viewLayers[`@storybook/${p}`];
    if (!viewLayer) {
      throw new Error(`Unsupported viewlayer specified in CHROMATIC_STORYBOOK_VERSION: ${p}`);
    }
    return { version, viewLayer };
  }

  // Pull the viewlayer from dependencies in package.json
  const [dep, devDep, peerDep] = findDependency(packageJson, ([key]) => viewLayers[key]);
  const [pkg, version] = dep || devDep || peerDep || [];
  const viewLayer = viewLayers[pkg];

  if (dep && devDep && dep[0] === devDep[0]) {
    log.warn(
      `Found "${dep[0]}" in both "dependencies" and "devDependencies". This is probably a mistake.`
    );
  }
  if (dep && peerDep && dep[0] === peerDep[0]) {
    log.warn(
      `Found "${dep[0]}" in both "dependencies" and "peerDependencies". This is probably a mistake.`
    );
  }

  if (viewLayer) {
    if (options.storybookBuildDir) {
      // If we aren't going to invoke the Storybook CLI later, we can exit early.
      // Note that `version` can be a semver range in this case.
      return { viewLayer, version };
    }

    // Verify that the viewlayer package is actually present in node_modules.
    return Promise.race([
      resolvePackageJson(pkg)
        .then((json) => ({ viewLayer, version: json.version }))
        .catch(() => Promise.reject(new Error(noViewLayerPackage(pkg)))),
      timeout(10000),
    ]);
  }

  if (!options.interactive) {
    log.info(`No viewlayer package listed in dependencies. Checking transitive dependencies.`);
  }

  // We might have a transitive dependency (e.g. through `@nuxtjs/storybook` which depends on
  // `@storybook/vue`). In this case we look for any viewlayer package present in node_modules,
  // and return the first one we find.
  return Promise.race([
    raceFulfilled(
      Object.entries(viewLayers).map(async ([key, value]) => {
        const json = await resolvePackageJson(key);
        return { viewLayer: value, version: json.version };
      })
    ).catch(() => Promise.reject(new Error(noViewLayerPackage(pkg)))),
    timeout(10000),
  ]);
};

const findAddons = async ({ packageJson }) => ({
  addons: Object.entries(supportedAddons)
    .map(([pkg, name]) => {
      const [dep, devDep, peerDep] = findDependency(packageJson, ([key]) => key === pkg);
      const [packageName, packageVersion] = dep || devDep || peerDep || [];
      return packageName && packageVersion && { name, packageName, packageVersion };
    })
    .filter(Boolean),
});

const findConfigFlags = async ({ options, packageJson }) => {
  const { scripts = {} } = packageJson;
  if (!options.buildScriptName || !scripts[options.buildScriptName]) return {};

  const { flags } = meow({
    argv: parseArgsStringToArgv(scripts[options.buildScriptName]),
    flags: {
      configDir: { type: 'string', alias: 'c' },
      staticDir: { type: 'string', alias: 's' },
    },
  });

  return {
    configDir: flags.configDir,
    staticDir: flags.staticDir && flags.staticDir.split(','),
  };
};

export default async function getStorybookInfo(
  ctx: Context
): Promise<Partial<Context['storybook']>> {
  try {
    const info = await Promise.all([findAddons(ctx), findConfigFlags(ctx), findViewlayer(ctx)]);
    return info.reduce((acc, obj) => Object.assign(acc, obj), {});
  } catch (e) {
    const result = await getInstalledStorybookInfo();
    if (result.viewLayer) {
      return result;
    }
    return { viewLayer: null, version: null, addons: [] };
  }
}
