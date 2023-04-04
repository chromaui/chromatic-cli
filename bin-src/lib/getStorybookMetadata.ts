import fs from 'fs-extra';
import meow from 'meow';
import { parseArgsStringToArgv } from 'string-argv';
import semver from 'semver';

import path from 'path';
import { Context } from '../types';
import packageDoesNotExist from '../ui/messages/errors/noViewLayerPackage';
import { viewLayers } from './viewLayers';
import { timeout, raceFulfilled } from './promises';
import { supportedAddons } from './supportedAddons';
import { builders } from './builders';

export const resolvePackageJson = (pkg: string) => {
  try {
    const packagePath = path.resolve(`node_modules/${pkg}/package.json`);
    return fs.readJson(packagePath);
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

const getDependencyInfo = ({ packageJson, log }, dependencyMap: Record<string, string>) => {
  log.debug('getDependencyInfo', packageJson);
  const [dep, devDep, peerDep] = findDependency(packageJson, ([key]) => dependencyMap[key]);
  const [pkg, version] = dep || devDep || peerDep || [];
  const dependency = viewLayers[pkg];

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
  return { dependency, version, dependencyPackage: pkg };
};

const findViewlayer = async ({ env, log, options, packageJson }) => {
  // Allow setting Storybook version via CHROMATIC_STORYBOOK_VERSION='@storybook/react@4.0-alpha.8' for unusual cases
  log.debug('findViewLayer', packageJson);
  log.debug('env.CHROMATIC_STORYBOOK_VERSION', env.CHROMATIC_STORYBOOK_VERSION);

  if (env.CHROMATIC_STORYBOOK_VERSION) {
    const [, p, v] = env.CHROMATIC_STORYBOOK_VERSION.match(/(.+)@(.+)$/) || [];
    const version = semver.valid(v); // ensures we get a specific version, not a range
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

  const {
    dependency: viewLayer,
    version,
    dependencyPackage: pkg,
  } = getDependencyInfo({ log, packageJson }, viewLayers);

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
        .catch(() => Promise.reject(new Error(packageDoesNotExist(pkg)))),
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
    ).catch(() => Promise.reject(new Error(packageDoesNotExist(pkg)))),
    timeout(10000),
  ]);
};

const findAddons = async (ctx, mainConfig) => {
  if (mainConfig?.addons) {
    const allDependencies = {
      ...ctx.packageJson?.dependencies,
      ...ctx.packageJson?.devDependencies,
      ...ctx.packageJson?.peerDependencies,
    };
    return {
      addons: mainConfig.addons.map((addon) => {
        let name: string;
        if (typeof addon === 'string') {
          name = addon.replace('/register', '');
        } else {
          name = addon.name;
        }

        return {
          name: supportedAddons[name],
          packageName: name,
          packageVersion: allDependencies[name],
        };
      }),
    };
  }
  return {
    addons: [],
  };
};

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

export const findBuilder = async (mainConfig) => {
  let name = 'webpack4'; // default builder in Storybook v6
  if (mainConfig?.core?.builder) {
    const { builder } = mainConfig.core;
    name = typeof builder === 'string' ? builder : builder.name;
  }

  return Promise.race([
    resolvePackageJson(builders[name])
      .then((json) => ({ builder: { name, packageVersion: json.version } }))
      .catch(() => Promise.reject(new Error(packageDoesNotExist(builders[name])))),
    timeout(10000),
  ]);
};

export const getStorybookMetadata = async (ctx: Context) => {
  ctx.log.debug('getStorybookMetadata ', ctx.packageJson);
  const configDir = ctx.options.storybookConfigDir ?? '.storybook';
  const r = typeof __non_webpack_require__ !== 'undefined' ? __non_webpack_require__ : require;
  const mainConfig = await r(path.resolve(configDir, 'main'));

  const addons = await findAddons(ctx, mainConfig);
  ctx.log.debug('addons', addons);

  const configFlags = await findConfigFlags(ctx);
  ctx.log.debug('config', configFlags);

  const viewLayer = await findViewlayer(ctx);
  ctx.log.debug('viewLayer', viewLayer);

  const builder = await findBuilder(mainConfig);
  ctx.log.debug('builder', builder);

  const info = [addons, configFlags, viewLayer, builder];

  ctx.log.debug('awaited info promises');
  const reducedInfo = info.reduce((acc, obj) => Object.assign(acc, obj), {});
  ctx.log.debug('reduced info', reducedInfo);

  return reducedInfo;
};
