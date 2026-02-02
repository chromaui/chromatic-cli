import { readdir } from 'fs/promises';
import { readJson } from 'fs-extra';
import meow from 'meow';
import path from 'path';
import semver from 'semver';
import { printConfig, readConfig } from 'storybook/internal/csf-tools';
import { parseArgsStringToArgv } from 'string-argv';

import { Context } from '../types';
import packageDoesNotExist from '../ui/messages/errors/noViewLayerPackage';
import { builders } from './builders';
import { raceFulfilled, timeout } from './promises';
import { viewLayers } from './viewLayers';

export const resolvePackageJson = (pkg: string) => {
  try {
    const packagePath = path.resolve(`node_modules/${pkg}/package.json`);
    return readJson(packagePath);
  } catch (error) {
    return Promise.reject(error);
  }
};

const findDependency = (
  { dependencies, devDependencies, peerDependencies },
  predicate: (key: string) => string
) => [
  Object.keys(dependencies || {}).find((dependency) => predicate(dependency)),
  Object.keys(devDependencies || {}).find((dependency) => predicate(dependency)),
  Object.keys(peerDependencies || {}).find((dependency) => predicate(dependency)),
];

const getDependencyInfo = ({ packageJson, log }, dependencyMap: Record<string, string>) => {
  // eslint-disable-next-line unicorn/prevent-abbreviations
  const [dep, devDep, peerDep] = findDependency(packageJson, (key) => dependencyMap[key]);
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

const findStorybookVersion = async ({ env, log, options, packageJson }) => {
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
    return { version };
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
      return { version };
    }
    // Verify that the viewlayer package is actually present in node_modules.
    return Promise.race([
      resolvePackageJson(pkg)
        .then((json) => ({ version: json.version }))
        .catch(() => {
          throw new Error(packageDoesNotExist(pkg));
        }),
      timeout(10_000),
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
      Object.entries(viewLayers).map(async ([key]) => {
        const json = await resolvePackageJson(key);
        return { version: json.version };
      })
    ).catch(() => {
      throw new Error(packageDoesNotExist(pkg));
    }),
    timeout(10_000),
  ]);
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

// TODO: refactor this function
// eslint-disable-next-line complexity
export const findBuilder = async (mainConfig, v7) => {
  if (!mainConfig) {
    return { builder: { name: 'unknown', packageVersion: '0' } };
  }

  const framework = v7 ? mainConfig.getSafeFieldValue(['framework']) : mainConfig?.framework;
  const core = v7 ? mainConfig.getSafeFieldValue(['core']) : mainConfig?.core;

  if (framework?.name) {
    const sbV7BuilderName = framework.name;

    return Promise.race([
      resolvePackageJson(sbV7BuilderName)
        .then((json) => ({ builder: { name: sbV7BuilderName, packageVersion: json.version } }))
        .catch(() => {
          throw new Error(packageDoesNotExist(sbV7BuilderName));
        }),
      timeout(10_000),
    ]);
  }

  let name = 'webpack4'; // default builder in Storybook v6
  if (core?.builder) {
    const { builder } = core;
    name = typeof builder === 'string' ? builder : builder.name;
  }

  return Promise.race([
    resolvePackageJson(builders[name])
      .then((json) => ({ builder: { name, packageVersion: json.version } }))
      .catch(() => {
        throw new Error(packageDoesNotExist(builders[name]));
      }),
    timeout(10_000),
  ]);
};

export const findStorybookConfigFile = async (ctx: Context, pattern: RegExp) => {
  const configDirectory = ctx.options.storybookConfigDir ?? '.storybook';
  const files = await readdir(configDirectory);
  const configFile = files.find((file) => pattern.test(file));
  return configFile && path.join(configDirectory, configFile);
};

export const getStorybookMetadata = async (ctx: Context) => {
  const configDirectory = ctx.options.storybookConfigDir ?? '.storybook';

  // eslint-disable-next-line unicorn/prefer-module
  const r = typeof __non_webpack_require__ === 'undefined' ? require : __non_webpack_require__;

  let mainConfig;
  let v7 = false;
  try {
    mainConfig = await r(path.resolve(configDirectory, 'main'));
    ctx.log.debug({ configDirectory, mainConfig });
  } catch (err) {
    ctx.log.debug({ storybookV6error: err });
    try {
      const storybookConfig = await findStorybookConfigFile(ctx, /^main\.[jt]sx?$/);
      if (!storybookConfig) {
        throw new Error('Failed to locate Storybook config file');
      }

      mainConfig = await readConfig(storybookConfig);
      ctx.log.debug({ configDirectory, mainConfig: printConfig(mainConfig) });
      v7 = true;
    } catch (err) {
      ctx.log.debug({ storybookV7error: err });
    }
  }

  const info = await Promise.allSettled([
    findConfigFlags(ctx),
    findStorybookVersion(ctx),
    findBuilder(mainConfig, v7),
  ]);

  ctx.log.debug(info);
  let metadata = {};
  for (const sbItem of info) {
    if (sbItem.status === 'fulfilled') {
      metadata = {
        ...metadata,
        ...(sbItem?.value as any),
      };
    }
  }
  return metadata;
};
