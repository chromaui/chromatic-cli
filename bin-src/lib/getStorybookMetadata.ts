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
  if (mainConfig?.framework?.name) {
    const sbV7BuilderName = mainConfig.framework.name;

    return Promise.race([
      resolvePackageJson(sbV7BuilderName)
        .then((json) => ({ builder: { name: sbV7BuilderName, packageVersion: json.version } }))
        .catch(() => Promise.reject(new Error(packageDoesNotExist(sbV7BuilderName)))),
      timeout(10000),
    ]);
  }

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
  const configDir = ctx.options.storybookConfigDir ?? '.storybook';
  const r = typeof __non_webpack_require__ !== 'undefined' ? __non_webpack_require__ : require;
  const mainConfig = await r(path.resolve(configDir, 'main'));

  const info = await Promise.allSettled([
    findAddons(ctx, mainConfig),
    findConfigFlags(ctx),
    findViewlayer(ctx),
    findBuilder(mainConfig),
  ]);
  ctx.log.debug(info);
  return info.reduce((acc, obj) => Object.assign(acc, obj), {});
};
