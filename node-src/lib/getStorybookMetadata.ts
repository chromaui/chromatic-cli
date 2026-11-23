import { readdir } from 'fs/promises';
import { pathExists } from 'fs-extra';
import meow from 'meow';
import path from 'path';
import semver from 'semver';
import { printConfig, readConfig } from 'storybook/internal/csf-tools';
import { parseArgsStringToArgv } from 'string-argv';

import type { StorybookInfoDeps } from '../tasks/storybookInfo';
import { AbsolutePath, Storybook } from '../types';
import packageDoesNotExist from '../ui/messages/errors/noViewLayerPackage';
import { builders } from './builders';
import {
  ensurePnpRuntime,
  readFrameworkStorybookVersion,
  readInstalledVersion,
  VersionNotFoundError,
} from './installedPackages';
import { meowImportMeta } from './meowImportMeta';
import { viewLayers } from './viewLayers';

/**
 * Reads the `-c` and `-s` flags out of the project's Storybook build script.
 *
 * @param input The project's package.json and the resolved build script name.
 * @param input.buildScriptName The package.json script that builds Storybook.
 * @param input.packageJson The project's package.json.
 *
 * The flags resolve against the Storybook project root, because that is where Storybook runs the
 * build script from.
 *
 * @returns The config directory and static directories the build script names, if any.
 */
function findConfigFlags({
  buildScriptName,
  packageJson,
}: {
  buildScriptName?: string;
  packageJson: StorybookInfoDeps['packageJson'];
}): { configDir?: string; staticDir?: string[] } {
  const { scripts = {} } = packageJson;
  if (!buildScriptName || !scripts[buildScriptName]) return {};

  let flags: { configDir?: string; staticDir?: string };
  try {
    ({ flags } = meow({
      importMeta: meowImportMeta,
      argv: parseArgsStringToArgv(scripts[buildScriptName]),
      flags: {
        configDir: { type: 'string', shortFlag: 'c' },
        staticDir: { type: 'string', shortFlag: 's' },
      },
    }));
  } catch {
    return {};
  }

  return {
    configDir: flags.configDir,
    staticDir: flags.staticDir ? flags.staticDir.split(',') : undefined,
  };
}

/**
 * A loaded Storybook main config, which answers field reads in whichever form the config took.
 *
 * An evaluated module exposes its fields as plain properties, nested under `default` for ESM. A
 * parsed AST answers `getSafeFieldValue` instead. `readMainConfig` hides that behind `readField`, so
 * callers read fields the same way without caring which form the config took.
 */
interface MainConfigReader {
  /** Reads a top-level field, returning `undefined` when it is absent. */
  readField: (field: string) => unknown;
  /**
   * Reads the name of a preset field such as `framework` or `core.builder`, written either as a
   * string or as an object with a `name`. Returns `undefined` when it is absent or can't be read.
   */
  readName: (fieldPath: string[]) => string | undefined;
}

/**
 * Resolves the builder the main config declares, along with its installed version.
 *
 * @param mainConfig The loaded main config, or undefined when it could not be read.
 * @param configDirectory The absolute Storybook config directory to resolve the package from.
 * @param log The logger to record a resolution failure with.
 *
 * @returns The builder name and package version, or an unknown builder without a config.
 */
async function findBuilder(
  mainConfig: MainConfigReader | undefined,
  configDirectory: AbsolutePath,
  log: StorybookInfoDeps['log']
) {
  if (!mainConfig) {
    return { builder: { name: 'unknown', packageVersion: '0' } };
  }

  const readVersion = (packageName: string) => {
    const packageVersion = readInstalledVersion(log, configDirectory, packageName);
    if (!packageVersion) throw new Error(packageDoesNotExist(packageName));
    return packageVersion;
  };

  const framework = mainConfig.readName(['framework']);
  const builder = mainConfig.readName(['core', 'builder']);
  // From Storybook 7 the framework names the builder. Storybook 6 named its renderer there, such
  // as `@storybook/react`, and left the builder to `core.builder`, or to webpack 4. Third-party
  // frameworks have their own versions.
  const isRenderer = (name: string) =>
    packageNameOf(name).startsWith('@storybook/') &&
    (semver.coerce(readInstalledVersion(log, configDirectory, name))?.major ?? 7) < 7;
  if (framework && !isRenderer(framework)) {
    return { builder: { name: packageNameOf(framework), packageVersion: readVersion(framework) } };
  }

  const name = builder ? packageNameOf(builder) : 'webpack4'; // default builder in Storybook v6
  return { builder: { name, packageVersion: readVersion(builders[name]) } };
}

/**
 * Recovers the package name from a preset name. Storybook wraps names in `getAbsolutePath(...)` for
 * Yarn Plug'n'Play and monorepo projects, so an evaluated config holds the package's directory, such
 * as `.../node_modules/@storybook/react-vite`, or the same path inside a Yarn zip archive.
 *
 * @param nameOrPath A package name, or the absolute directory of an installed package.
 *
 * @returns The package name, or `nameOrPath` unchanged when it isn't inside a `node_modules`.
 */
function packageNameOf(nameOrPath: string) {
  if (!path.isAbsolute(nameOrPath)) return nameOrPath;

  const segments = nameOrPath.split(/[/\\]/);
  const index = segments.lastIndexOf('node_modules');
  if (index === -1) return nameOrPath;

  const [scopeOrName, name] = segments.slice(index + 1);
  return scopeOrName.startsWith('@') ? `${scopeOrName}/${name}` : scopeOrName;
}

// TODO: Update this when we start tracking refs within the project.json file; if refs are tracked there, we can skip this logic
// Only used by Chromatic - surfaces Storybook refs and is used when announcing a build.
// The refs are consumed by the MCP Addon for hosted Storybooks with composition on Chromatic.
async function findReferences(mainConfig?: MainConfigReader) {
  if (!mainConfig) {
    return {};
  }

  // An evaluated config can hand back a `refs` function, which we can't make sense of.
  const references = objectField(mainConfig, 'refs');
  return references ? { refs: references as NonNullable<Storybook['refs']> } : {};
}

/**
 * Resolves the absolute static directories, merging the build script's `-s` flag with the
 * main config's `staticDirs`. Storybook rejects both at once (and dropped `-s` in v8), so in
 * practice only one is populated; the union covers both.
 *
 * The two sources resolve against different roots: Storybook runs the build script from the project
 * root, but reads `staticDirs` entries relative to the config directory that declares them.
 *
 * @param input The loaded config and the roots each source of directories resolves against.
 * @param input.mainConfig The loaded main config, or undefined when it could not be read.
 * @param input.configDirectory The absolute config directory `staticDirs` entries resolve against.
 * @param input.buildScriptStaticDirs The build script's `-s` directories, or undefined when it declares none.
 * @param input.projectRoot The absolute Storybook project root the build script's `-s` directories
 *   resolve against.
 *
 * @returns The resolved static directories, or `{}` when there are none.
 *
 * @internal Exported only for its unit tests, which feed it each `staticDirs` shape through a fake
 *   config. Through `getStorybookMetadata`, every shape would need its own fixture project.
 */
export function findStaticDirectories({
  mainConfig,
  configDirectory,
  buildScriptStaticDirs,
  projectRoot,
}: {
  mainConfig?: MainConfigReader;
  configDirectory: AbsolutePath;
  buildScriptStaticDirs?: string[];
  projectRoot: AbsolutePath;
}): { staticDirs?: AbsolutePath[] } {
  const directories = [
    ...(buildScriptStaticDirs ?? []).map((directory) => path.resolve(projectRoot, directory)),
    ...readConfigStaticDirectories(mainConfig, configDirectory),
  ];

  const staticDirectories = [...new Set(directories)];
  return staticDirectories.length > 0 ? { staticDirs: staticDirectories } : {};
}

/**
 * Reads the main config's `staticDirs`, whose entries are relative to the config directory itself.
 *
 * @param mainConfig The loaded main config, or undefined when it could not be read.
 * @param configDirectory The absolute Storybook config directory the entries resolve against.
 *
 * @returns The declared static directories, or an empty list when the config declares none.
 */
function readConfigStaticDirectories(
  mainConfig: MainConfigReader | undefined,
  configDirectory: AbsolutePath
): AbsolutePath[] {
  const staticDirectories = mainConfig?.readField('staticDirs');
  if (!Array.isArray(staticDirectories)) return [];

  return staticDirectories
    .map((entry: string | { from: string }) => (typeof entry === 'string' ? entry : entry?.from))
    .filter(Boolean)
    .map((directory) => path.resolve(configDirectory, directory));
}

// The main config files we parse into an AST when `require()` of the config fails. Widening this
// widens what lands on `ctx.storybook`.
export const MAIN_CONFIG_PATTERN = /^main\.[cm]?[jt]sx?$/;

// The preview config filename: `preview` with any JS/TS module extension, same shape as
// MAIN_CONFIG_PATTERN.
export const PREVIEW_CONFIG_PATTERN = /^preview\.[cm]?[jt]sx?$/;

/**
 * Finds the first file in the Storybook config directory that matches the given pattern.
 *
 * @param storybookConfigDirectory The Storybook config directory, absolute or relative to the cwd.
 * @param pattern The pattern to match against the files in the config directory.
 *
 * @returns The path to the first matching file, or `undefined` when none match.
 */
export async function findStorybookConfigFile(
  storybookConfigDirectory: string | undefined,
  pattern: RegExp
) {
  const configDirectory = storybookConfigDirectory ?? '.storybook';
  const files = await readdir(configDirectory);
  const configFile = files.find((file) => pattern.test(file));
  return configFile && path.join(configDirectory, configFile);
}

/**
 * Loads the Storybook main config, as either an evaluated module or a parsed AST.
 *
 * Which form we get depends on whether `require()` of the config succeeds. Callers get a reader
 * either way, so the two forms stay isolated to this function.
 *
 * @param configDirectory The Storybook config directory, absolute or relative to the cwd.
 * @param log The logger to report the parse path to.
 *
 * @returns The config reader, or undefined when neither path yielded a config.
 */
async function readMainConfig(
  configDirectory: string,
  log: StorybookInfoDeps['log']
): Promise<MainConfigReader | undefined> {
  // @ts-expect-error __non_webpack_require__ is only defined when bundled with webpack, and allows us to bypass webpack's module system to require files at runtime
  // eslint-disable-next-line unicorn/prefer-module
  const r = typeof __non_webpack_require__ === 'undefined' ? require : __non_webpack_require__;

  try {
    const mainConfig = await r(path.resolve(configDirectory, 'main'));
    log.debug({ configDirectory, mainConfig });
    // An evaluated module that exports nothing is treated the same as no config at all.
    if (!mainConfig) return undefined;
    const readField = (field: string) => mainConfig.default?.[field] ?? mainConfig[field];
    return {
      readField,
      readName: ([field, ...nestedPath]) => {
        let value = readField(field);
        for (const key of nestedPath) value = isRecord(value) ? value[key] : undefined;
        if (typeof value === 'string') return value;
        return isRecord(value) && typeof value.name === 'string' ? value.name : undefined;
      },
    };
  } catch (err) {
    log.debug({ storybookV6error: err });
  }

  try {
    const storybookConfig = await findStorybookConfigFile(configDirectory, MAIN_CONFIG_PATTERN);
    if (!storybookConfig) {
      throw new Error('Failed to locate Storybook config file');
    }

    const mainConfig = await readConfig(storybookConfig);
    log.debug({ configDirectory, mainConfig: printConfig(mainConfig) });
    return {
      readField: (field) => mainConfig.getSafeFieldValue([field]),
      // Unlike `getSafeFieldValue`, this sees through a name wrapped in `getAbsolutePath(...)`, and
      // throws on a value it can't read statically, such as a variable.
      readName: (fieldPath) => {
        try {
          return mainConfig.getNameFromPath(fieldPath);
        } catch {
          return undefined;
        }
      },
    };
  } catch (err) {
    log.debug({ storybookV7error: err });
    return undefined;
  }
}

/**
 * Finds the Storybook metadata from the given dependencies.
 *
 * @param deps The dependencies to find the metadata with.
 * @param projectRoot The absolute Storybook project root used to resolve declared directories.
 *
 * @returns The Storybook metadata, or an empty object when none could be found.
 */
export async function getStorybookMetadata(
  deps: StorybookInfoDeps,
  projectRoot: AbsolutePath
): Promise<Partial<Omit<Storybook, 'projectRoot'>>> {
  const buildScript = findConfigFlags({
    buildScriptName: deps.options.buildScriptName,
    packageJson: deps.packageJson,
  });
  const configDirectory = await findConfigDirectory(deps, projectRoot, buildScript.configDir);
  let mainConfig = await readMainConfig(configDirectory, deps.log);
  const versionInfo = await Promise.allSettled([
    findStorybookVersion(deps, configDirectory, mainConfig?.readName(['framework']), async () => {
      // A config that requires its dependencies only evaluates once the runtime is loaded.
      mainConfig = await readMainConfig(configDirectory, deps.log);
      return mainConfig?.readName(['framework']);
    }),
  ]);

  const info = [
    ...versionInfo,
    ...(await Promise.allSettled([
      findBuilder(mainConfig, configDirectory, deps.log),
      findReferences(mainConfig),
    ])),
  ];

  deps.log.debug(info);
  let metadata: Partial<Omit<Storybook, 'projectRoot'>> = {
    configDir: configDirectory,
    ...findStaticDirectories({
      mainConfig,
      configDirectory,
      buildScriptStaticDirs: buildScript.staticDir,
      projectRoot,
    }),
  };
  for (const sbItem of info) {
    if (sbItem.status === 'fulfilled') {
      metadata = { ...metadata, ...sbItem.value };
    }
  }
  return metadata;
}

/**
 * Resolves the absolute Storybook config directory.
 *
 * `--storybook-config-dir` is documented as relative to where you run the CLI, but users also write
 * it relative to the Storybook project root — the value their build script's `-c` uses. The two only
 * differ under `--storybook-base-dir`. Rather than pick a frame and break the other set of users, we
 * try both and take whichever directory is really on disk. The project root goes first, because that
 * is the reading TurboSnap v1 has always ended up with once it joins the base directory on.
 *
 * Without the option the build script's `-c` decides, and Storybook runs that script from the project
 * root, so it needs no probe.
 *
 * @param deps The dependencies holding the user's options.
 * @param deps.log Standard context logger.
 * @param deps.options The user's options, including `--storybook-config-dir`.
 * @param projectRoot The absolute Storybook project root.
 * @param buildScriptConfigDirectory The build script's `-c` value, or undefined when it declares none.
 *
 * @returns The absolute config directory.
 */
export async function findConfigDirectory(
  { log, options }: StorybookInfoDeps,
  projectRoot: AbsolutePath,
  buildScriptConfigDirectory?: string
): Promise<AbsolutePath> {
  // The build script's `-c` locates the main config, not just the directory we report. TurboSnap v1
  // already falls back to it, so ignoring it here meant reading no config at all for a project whose
  // only signal is `-c`, and reporting no builder or static directories for it.
  if (!options.storybookConfigDir) {
    return path.resolve(projectRoot, buildScriptConfigDirectory ?? '.storybook');
  }

  const candidates = [
    path.resolve(projectRoot, options.storybookConfigDir),
    path.resolve(options.storybookConfigDir),
  ];
  log.debug('Looking for config directory from: ', candidates);
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      log.debug('Found config directory:', candidate);
      return candidate;
    }
  }

  // Neither is on disk, so the config read is going to fail either way. Report the project's own.
  return candidates[0];
}

/**
 * Finds the installed version of the Storybook the project's framework builds with. Under Yarn
 * Plug'n'Play nothing resolves until the project's runtime is loaded, so only a miss looks for one,
 * loads it and tries again. Projects that resolve never pay for that.
 *
 * @param deps The environment and logger.
 * @param deps.env The environment, which can pin the version with `CHROMATIC_STORYBOOK_VERSION`.
 * @param deps.log The logger.
 * @param configDirectory The absolute Storybook config directory to resolve from.
 * @param framework The framework the main config names, if any, as a name or a directory.
 * @param rereadFramework Reads the main config again once the runtime is loaded and returns its
 * framework.
 *
 * @returns The Storybook version.
 */
async function findStorybookVersion(
  { env, log }: StorybookInfoDeps,
  configDirectory: AbsolutePath,
  framework: string | undefined,
  rereadFramework: () => Promise<string | undefined>
) {
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

  const readVersion = (fromFramework: string | undefined) => {
    try {
      return readFrameworkStorybookVersion(log, configDirectory, fromFramework);
    } catch (error) {
      // Its message is advice for TurboSnap, so a miss is reported below in our own words.
      if (error instanceof VersionNotFoundError) return undefined;
      throw error;
    }
  };
  const version =
    readVersion(framework) ??
    (ensurePnpRuntime(configDirectory, log).status === 'loaded'
      ? readVersion(await rereadFramework())
      : undefined);
  if (!version) throw new Error(packageDoesNotExist('storybook'));
  return { version };
}

/**
 * Reads a field only when it holds a plain object, which is all our callers can use. An evaluated
 * config can hand back a function or a class instance where a parsed AST hands back nothing.
 *
 * @param mainConfig The loaded main config, or undefined when it could not be read.
 * @param field The top-level field to read.
 *
 * @returns The field's value when it is a plain object, otherwise `undefined`.
 */
function objectField(
  mainConfig: MainConfigReader,
  field: string
): Record<string, unknown> | undefined {
  const value = mainConfig?.readField(field);
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
