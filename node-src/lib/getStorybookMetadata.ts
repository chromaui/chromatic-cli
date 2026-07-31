import { readdir } from 'fs/promises';
import { readJson } from 'fs-extra';
import meow from 'meow';
import path from 'path';
import semver from 'semver';
import { printConfig, readConfig } from 'storybook/internal/csf-tools';
import { parseArgsStringToArgv } from 'string-argv';

import type { StorybookInfoDeps } from '../tasks/storybookInfo';
import { Storybook } from '../types';
import packageDoesNotExist from '../ui/messages/errors/noViewLayerPackage';
import { builders } from './builders';
import { posix } from './posix';
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
  { dependencies, devDependencies, peerDependencies }: StorybookInfoDeps['packageJson'],
  predicate: (key: string) => string
) => [
  Object.keys(dependencies || {}).find((dependency) => predicate(dependency)),
  Object.keys(devDependencies || {}).find((dependency) => predicate(dependency)),
  Object.keys(peerDependencies || {}).find((dependency) => predicate(dependency)),
];

const getDependencyInfo = (
  { packageJson, log }: Pick<StorybookInfoDeps, 'packageJson' | 'log'>,
  dependencyMap: Record<string, string>
) => {
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

const findStorybookVersion = async ({ env, log, options, packageJson }: StorybookInfoDeps) => {
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

/**
 * Reads the `-c` and `-s` flags out of the project's Storybook build script.
 *
 * Takes the build script name directly so `chromatic turbosnap-manifest` derives the flags the same
 * way a real build does, rather than reading a different config directory than production would.
 *
 * @param input The project's package.json and the resolved build script name.
 * @param input.buildScriptName The package.json script that builds Storybook.
 * @param input.packageJson The project's package.json.
 *
 * @returns The config directory and static directories the build script names, if any.
 */
export const findConfigFlags = async ({
  buildScriptName,
  packageJson,
}: {
  buildScriptName?: string;
  packageJson: StorybookInfoDeps['packageJson'];
}) => {
  const { scripts = {} } = packageJson;
  if (!buildScriptName || !scripts[buildScriptName]) return {};

  const { flags } = meow({
    argv: parseArgsStringToArgv(scripts[buildScriptName]),
    flags: {
      configDir: { type: 'string', alias: 'c' },
      staticDir: { type: 'string', alias: 's' },
    },
  });

  return {
    configDir: flags.configDir,
    staticDir: flags.staticDir ? flags.staticDir.split(',') : undefined,
  };
};

/**
 * Reads a top-level field out of the main config, in either of the two forms it can take.
 *
 * An evaluated module exposes its fields as plain properties, nested under `default` for ESM. A
 * parsed AST answers `getSafeFieldValue` instead.
 *
 * @param mainConfig The main config, either an evaluated module or a parsed AST.
 * @param isAstConfig Whether `mainConfig` is a parsed AST rather than an evaluated module.
 * @param field The top-level field to read.
 *
 * @returns The field's value, or `undefined` when it is absent.
 */
export const readMainConfigField = (mainConfig: any, isAstConfig: boolean, field: string) => {
  if (!mainConfig) return undefined;
  if (isAstConfig) return mainConfig.getSafeFieldValue([field]);
  return mainConfig.default?.[field] ?? mainConfig[field];
};

export const findBuilder = async (mainConfig, isAstConfig) => {
  if (!mainConfig) {
    return { builder: { name: 'unknown', packageVersion: '0' } };
  }

  const framework = readMainConfigField(mainConfig, isAstConfig, 'framework');
  const core = readMainConfigField(mainConfig, isAstConfig, 'core');

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

// TODO: Update this when we start tracking refs within the project.json file; if refs are tracked there, we can skip this logic
// Only used by Chromatic - surfaces Storybook refs and is used when announcing a build.
// The refs are consumed by the MCP Addon for hosted Storybooks with composition on Chromatic.
const findReferences = async (mainConfig, isAstConfig) => {
  // The MCP Addon was first added within version 9; there is no need to check for older versions
  if (!mainConfig || !isAstConfig) {
    return {};
  }

  const references = readMainConfigField(mainConfig, isAstConfig, 'refs');
  return references ? { refs: references } : {};
};

/**
 * Resolves the project-relative static directories declared by the main config.
 *
 * @param mainConfig The main config, either an evaluated module or a parsed AST.
 * @param isAstConfig Whether `mainConfig` is a parsed AST rather than an evaluated module.
 * @param configDirectory The project-relative Storybook config directory entries resolve against.
 *
 * @returns The resolved static directories, or `{}` when the config declares none.
 */
export const findStaticDirectories = (
  mainConfig: any,
  isAstConfig: boolean,
  configDirectory = '.storybook'
): { staticDir?: string[] } => {
  const staticDirectories = readMainConfigField(mainConfig, isAstConfig, 'staticDirs');
  if (!Array.isArray(staticDirectories) || staticDirectories.length === 0) return {};

  // staticDirs entries can be plain strings or { from, to } DirectoryMapping objects
  const directories = staticDirectories
    .map((entry: string | { from: string }) => (typeof entry === 'string' ? entry : entry?.from))
    .filter(Boolean) as string[];

  // Convert directories to posix for cross-platform consistency
  const safeConfigDirectory = posix(configDirectory);
  const resolvedDirectories = directories.map((directory) =>
    path.posix.isAbsolute(directory) ? directory : path.posix.join(safeConfigDirectory, directory)
  );

  return resolvedDirectories.length > 0 ? { staticDir: resolvedDirectories } : {};
};

export const findStorybookConfigFile = async (
  storybookConfigDirectory: string | undefined,
  pattern: RegExp
) => {
  const configDirectory = storybookConfigDirectory ?? '.storybook';
  const files = await readdir(configDirectory);
  const configFile = files.find((file) => pattern.test(file));
  return configFile && path.join(configDirectory, configFile);
};

/**
 * Loads the Storybook main config, as either an evaluated module or a parsed AST.
 *
 * Which form we get depends on whether `require()` of the config succeeds.
 *
 * @param configDirectory The Storybook config directory, absolute or relative to the cwd.
 * @param log The logger to report the parse path to.
 *
 * @returns The config and whether it is a parsed AST; no config when neither path succeeded.
 */
export const readMainConfig = async (
  configDirectory: string,
  log: StorybookInfoDeps['log']
): Promise<{ mainConfig?: any; isAstConfig: boolean }> => {
  // @ts-expect-error __non_webpack_require__ is only defined when bundled with webpack, and allows us to bypass webpack's module system to require files at runtime
  // eslint-disable-next-line unicorn/prefer-module
  const r = typeof __non_webpack_require__ === 'undefined' ? require : __non_webpack_require__;

  try {
    const mainConfig = await r(path.resolve(configDirectory, 'main'));
    log.debug({ configDirectory, mainConfig });
    return { mainConfig, isAstConfig: false };
  } catch (err) {
    log.debug({ storybookV6error: err });
  }

  try {
    // Include `.mjs` and `.cjs` can't be resolved in the step above because `require()` only
    // auto-appends `.js`/`.json`/`.node` to an extensionless path.
    const storybookConfig = await findStorybookConfigFile(configDirectory, /^main\.[cm]?[jt]sx?$/);
    if (!storybookConfig) {
      throw new Error('Failed to locate Storybook config file');
    }

    const mainConfig = await readConfig(storybookConfig);
    log.debug({ configDirectory, mainConfig: printConfig(mainConfig) });
    return { mainConfig, isAstConfig: true };
  } catch (err) {
    log.debug({ storybookV7error: err });
    return { isAstConfig: false };
  }
};

// TODO: refactor this function
export const getStorybookMetadata = async (
  deps: StorybookInfoDeps
): Promise<Partial<Storybook>> => {
  const configDirectory = deps.options.storybookConfigDir ?? '.storybook';
  const { mainConfig, isAstConfig } = await readMainConfig(configDirectory, deps.log);

  const info = await Promise.allSettled([
    findConfigFlags({
      buildScriptName: deps.options.buildScriptName,
      packageJson: deps.packageJson,
    }),
    findStorybookVersion(deps),
    findBuilder(mainConfig, isAstConfig),
    findReferences(mainConfig, isAstConfig),
    findStaticDirectories(mainConfig, isAstConfig, configDirectory),
  ]);

  deps.log.debug(info);
  let metadata: Record<string, any> = {};
  for (const sbItem of info) {
    if (sbItem.status === 'fulfilled') {
      const { staticDir: staticDirectories, ...rest } = sbItem?.value as any;
      metadata = { ...metadata, ...rest };

      // Merge static directories from multiple sources and remove duplicates
      if (staticDirectories?.length) {
        metadata.staticDir = [...new Set([...(metadata.staticDir ?? []), ...staticDirectories])];
      }
    }
  }
  return metadata;
};
