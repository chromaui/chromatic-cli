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
 * A loaded Storybook main config, which answers field reads in whichever form the config took.
 *
 * An evaluated module exposes its fields as plain properties, nested under `default` for ESM. A
 * parsed AST answers `getSafeFieldValue` instead. Only `readMainConfig` knows which it got.
 */
export interface MainConfigReader {
  /** Reads a top-level field, returning `undefined` when it is absent. */
  readField: (field: string) => unknown;
  /** Whether the config was parsed as an AST rather than evaluated as a module. */
  isAstConfig: boolean;
}

/**
 * Resolves the builder the main config declares, along with its installed version.
 *
 * @param mainConfig The loaded main config, or undefined when it could not be read.
 *
 * @returns The builder name and package version, or an unknown builder without a config.
 */
export async function findBuilder(mainConfig?: MainConfigReader) {
  if (!mainConfig) {
    return { builder: { name: 'unknown', packageVersion: '0' } };
  }

  const framework = objectField(mainConfig, 'framework');
  const core = objectField(mainConfig, 'core');

  if (typeof framework?.name === 'string') {
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
  const builder = core?.builder;
  if (typeof builder === 'string') {
    name = builder;
  } else if (isRecord(builder) && typeof builder.name === 'string') {
    name = builder.name;
  }

  return Promise.race([
    resolvePackageJson(builders[name])
      .then((json) => ({ builder: { name, packageVersion: json.version } }))
      .catch(() => {
        throw new Error(packageDoesNotExist(builders[name]));
      }),
    timeout(10_000),
  ]);
}

/** Reads a field only when it holds a plain object, which is all `findBuilder` can use. */
function objectField(
  mainConfig: MainConfigReader,
  field: string
): Record<string, unknown> | undefined {
  const value = mainConfig.readField(field);
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// TODO: Update this when we start tracking refs within the project.json file; if refs are tracked there, we can skip this logic
// Only used by Chromatic - surfaces Storybook refs and is used when announcing a build.
// The refs are consumed by the MCP Addon for hosted Storybooks with composition on Chromatic.
async function findReferences(mainConfig?: MainConfigReader) {
  const references = mainConfig?.readField('refs');
  return references ? { refs: references } : {};
}

/**
 * Resolves the project-relative static directories declared by the main config.
 *
 * @param mainConfig The loaded main config, or undefined when it could not be read.
 * @param configDirectory The project-relative Storybook config directory entries resolve against.
 *
 * @returns The resolved static directories, or `{}` when the config declares none.
 */
export function findStaticDirectories(
  mainConfig: MainConfigReader | undefined,
  configDirectory = '.storybook'
): { staticDir?: string[] } {
  const staticDirectories = mainConfig?.readField('staticDirs');
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
}

/**
 * Unions the static directories the build script's `-s` names with the ones `main.*` declares.
 *
 * Exported so the TurboSnap v2 input derives the same set from the same two sources rather than
 * asserting parity with a second copy of the union.
 *
 * @param buildScriptStaticDirectories The static directories the build script's `-s` names.
 * @param mainConfigStaticDirectories The static directories `main.*` declares.
 *
 * @returns The de-duplicated union of both.
 */
export function mergeStaticDirectories(
  buildScriptStaticDirectories: string[] = [],
  mainConfigStaticDirectories: string[] = []
): string[] {
  return [...new Set([...buildScriptStaticDirectories, ...mainConfigStaticDirectories])];
}

/**
 * The main config files the shared metadata path parses into an AST when `require()` of the config
 * fails: `main.js`, `main.jsx`, `main.ts` and `main.tsx`.
 *
 * `main.ts`/`main.tsx` are the ordinary case, since `require()` cannot resolve them. `main.js` is in
 * the pattern too and is parsed whenever `require()` of it throws, which includes an ESM `main.js`
 * on a Node without `require(esm)` (unflagged from 22.12, and this package supports >=22.0). That is
 * pre-existing behaviour, not a widening.
 *
 * `main.mjs` and `main.cjs` are deliberately absent: parsing them would newly populate `builder`,
 * `refs` and `staticDir` on `ctx.storybook`, and TurboSnap v1 reads `staticDir` to decide its
 * static-file bails. Callers that only feed TurboSnap v2 pass a wider pattern of their own.
 */
const SHARED_MAIN_CONFIG_PATTERN = /^main\.[jt]sx?$/;

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
 * Which form we get depends on whether `require()` of the config succeeds. Callers get a reader
 * either way, so the two forms stay in here.
 *
 * @param configDirectory The Storybook config directory, absolute or relative to the cwd.
 * @param log The logger to report the parse path to.
 * @param configFilePattern Which config file names to parse when `require()` fails. Widening this
 * widens what lands on `ctx.storybook`, which TurboSnap v1 reads.
 *
 * @returns The config reader, or undefined when neither path yielded a config.
 */
export async function readMainConfig(
  configDirectory: string,
  log: StorybookInfoDeps['log'],
  configFilePattern: RegExp
): Promise<MainConfigReader | undefined> {
  // @ts-expect-error __non_webpack_require__ is only defined when bundled with webpack, and allows us to bypass webpack's module system to require files at runtime
  // eslint-disable-next-line unicorn/prefer-module
  const r = typeof __non_webpack_require__ === 'undefined' ? require : __non_webpack_require__;

  try {
    const mainConfig = await r(path.resolve(configDirectory, 'main'));
    log.debug({ configDirectory, mainConfig });
    // An evaluated module that exports nothing is treated the same as no config at all.
    if (!mainConfig) return undefined;
    return {
      readField: (field) => mainConfig.default?.[field] ?? mainConfig[field],
      isAstConfig: false,
    };
  } catch (err) {
    log.debug({ storybookV6error: err });
  }

  try {
    const storybookConfig = await findStorybookConfigFile(configDirectory, configFilePattern);
    if (!storybookConfig) {
      throw new Error('Failed to locate Storybook config file');
    }

    const mainConfig = await readConfig(storybookConfig);
    log.debug({ configDirectory, mainConfig: printConfig(mainConfig) });
    return { readField: (field) => mainConfig.getSafeFieldValue([field]), isAstConfig: true };
  } catch (err) {
    log.debug({ storybookV7error: err });
    return undefined;
  }
}

// TODO: refactor this function
export const getStorybookMetadata = async (
  deps: StorybookInfoDeps
): Promise<Partial<Storybook>> => {
  const configDirectory = deps.options.storybookConfigDir ?? '.storybook';
  const mainConfig = await readMainConfig(configDirectory, deps.log, SHARED_MAIN_CONFIG_PATTERN);

  // `refs` and `staticDir` land on `ctx.storybook`, which TurboSnap v1 reads to decide its
  // static-file bails, so both stay restricted to AST-parsed configs as they were before the reader
  // existed. Callers that only feed TurboSnap v2 read the config themselves, unrestricted.
  const astConfig = mainConfig?.isAstConfig ? mainConfig : undefined;

  const info = await Promise.allSettled([
    findConfigFlags({
      buildScriptName: deps.options.buildScriptName,
      packageJson: deps.packageJson,
    }),
    findStorybookVersion(deps),
    findBuilder(mainConfig),
    findReferences(astConfig),
    findStaticDirectories(astConfig, configDirectory),
  ]);

  deps.log.debug(info);
  let metadata: Record<string, any> = {};
  for (const sbItem of info) {
    if (sbItem.status === 'fulfilled') {
      const { staticDir: staticDirectories, ...rest } = sbItem?.value as any;
      metadata = { ...metadata, ...rest };

      // Merge static directories from multiple sources and remove duplicates
      if (staticDirectories?.length) {
        metadata.staticDir = mergeStaticDirectories(metadata.staticDir, staticDirectories);
      }
    }
  }
  return metadata;
};
