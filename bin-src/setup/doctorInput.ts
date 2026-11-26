import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import dotenv from 'dotenv';
import JSON5 from 'json5';

import type { InitialContext } from '../../node-src';
import { getConfiguration } from '../../node-src/lib/getConfiguration';
import getEnvironment from '../../node-src/lib/getEnvironment';
import { findBuildScriptName, getPartialOptions } from '../../node-src/lib/getOptions';
import { findConfigDirectory, findConfigFlags } from '../../node-src/lib/getStorybookMetadata';
import { getStorybookProjectRoot } from '../../node-src/lib/getStorybookProjectRoot';
import { createLogger } from '../../node-src/lib/log';
import { matchesFile } from '../../node-src/lib/utilities';
import { validateFiles } from '../../node-src/tasks/prepare/validateFiles';
import type { StorybookInfoDeps } from '../../node-src/tasks/storybookInfo';
import type { Flags, Options } from '../../node-src/types';
import pkg from '../../package.json';
import type { Fix } from './checks';
import type { CliVersions } from './cliVersion';
import { installableVersion } from './install';
import { forEachRepoFile, isEditableJson, readJson, relativeOrDot, rewriteJson } from './shared';

// One logger for every check run: each createLogger adds a process listener, so `--fix`, which
// checks again after each fix, would pile them up until Node warns.
let sharedLog: ReturnType<typeof createLogger> | undefined;
export const silentLog = () => (sharedLog ??= createLogger({ logLevel: 'silent' }));

/** The options doctor checks, merged by the main command's own option handling. */
type CheckedOptions = Partial<Options>;

export interface DoctorInput {
  cwd: string;
  gitRoot?: string;
  /** How many repository files each untraced and externals glob matches, and each suggestion. */
  globMatches: Map<string, number>;
  /** For each `**\/` suggestion, the folders its matches are in, where the rest of the glob starts. */
  globFolders: Map<string, Set<string>>;
  branch?: string;
  configFile?: string;
  /** The config file's raw contents, so fixes can rewrite it. */
  configJson?: Record<string, any>;
  /** Which keys came from the config file, so fixes only touch the file for those. */
  configKeys: Set<string>;
  /** Which options were passed as flags. A flag wins over the config file, so fixing it there does nothing. */
  flagKeys: Set<string>;
  /** Whether fixes can edit the config file: JSON or JSONC, which keeps its comments, or no file yet. */
  configEditable: boolean;
  options: CheckedOptions;
  packageJsonPath?: string;
  packageJson?: Record<string, any>;
  /**
   * The chromatic version the fix that adds it writes: this CLI's own, or the newest release the
   * package manager's minimum release age lets it install.
   */
  chromaticVersion: string;
  /** CHROMATIC_ARCHIVE_LOCATION as a build from cwd sees it, from the environment or its .env. */
  archiveLocation?: string;
  /** The Storybook config directory a build would read, resolved by the build's own code. */
  storybookConfigDirectory: string;
  /** Why storybookBuildDir isn't a usable Storybook build, from the build's own validation. */
  buildDirectoryError?: string;
  /**
   * Whether a build uploads a prebuilt Storybook, set here or in the chromatic script. CI may pass
   * it too, which doctor can't see.
   */
  prebuilt: boolean;
  /** The installed chromatic and the latest release. Only doctor reads these, not init's closing check. */
  cliVersions?: CliVersions;
}

function nearestPackageJson(cwd: string, stopAt?: string) {
  for (let directory = cwd; ; directory = path.dirname(directory)) {
    const file = path.join(directory, 'package.json');
    if (existsSync(file)) return file;
    if (directory === stopAt || directory === path.dirname(directory)) return undefined;
  }
}

// Flags meow fills in with a default, which aren't the user's choice.
const FLAG_DEFAULTS = new Set(['fileHashing', 'interactive']);

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Loads the config file as the main command does, and decides whether fixes may rewrite it.
 *
 * @param cwd Working directory Chromatic runs from.
 * @param flags The main command's flags, for --config-file.
 *
 * @returns The parsed configuration, the file's path and contents, or the error loading it.
 */
async function readConfigFile(cwd: string, flags: Flags) {
  let configuration: Record<string, any> = {};
  try {
    configuration = await getConfiguration(flags.configFile);
  } catch (err) {
    return { configuration, configError: errorMessage(err), configEditable: false };
  }
  if (!configuration.configFile) return { configuration, configEditable: true };
  const configFile = path.resolve(cwd, configuration.configFile);
  const configText = readFileSync(configFile, 'utf8');
  return {
    configuration,
    configFile,
    configJson: JSON5.parse<Record<string, any>>(configText),
    // Fixes edit JSON and JSONC in place, keeping comments; other JSON5 syntax can't be edited.
    configEditable: isEditableJson(configText),
  };
}

/**
 * The .env a build from cwd loads.
 *
 * @param cwd Working directory Chromatic runs from.
 *
 * @returns Its variables, or none without one.
 */
function dotEnvironment(cwd: string): Record<string, string> {
  const environmentFile = path.join(cwd, '.env');
  return existsSync(environmentFile) ? dotenv.parse(readFileSync(environmentFile)) : {};
}

/**
 * The environment a build from cwd sees: .env loaded from there, where a variable already set
 * wins, as with dotenv.
 *
 * @param cwd Working directory Chromatic runs from.
 *
 * @returns The main command's environment settings.
 */
function buildEnvironment(cwd: string) {
  const fromFile = dotEnvironment(cwd);
  return {
    ...getEnvironment(),
    CHROMATIC_PROJECT_TOKEN:
      process.env.CHROMATIC_PROJECT_TOKEN ?? fromFile.CHROMATIC_PROJECT_TOKEN,
  };
}

/**
 * Reads the config file, flags, environment and package.json the way the main command does, with
 * its own option handling, so doctor sees the options a build from this directory would see.
 *
 * @param input What the caller already knows.
 * @param input.cwd Working directory Chromatic runs from.
 * @param input.gitRoot Repository root, if in a git repository.
 * @param input.branch Current branch.
 * @param input.argv The arguments doctor got, which the main command's parser reads.
 * @param input.flags The main command's flags parsed from argv.
 *
 * @returns The input for runChecks, plus an error if the config file or the options are broken.
 */
export async function loadDoctorInput(input: {
  cwd: string;
  gitRoot?: string;
  branch?: string;
  argv: string[];
  flags: Flags;
}): Promise<{ doctorInput: DoctorInput; configError?: string; optionsError?: string }> {
  const { cwd, flags, argv } = input;
  const config = await readConfigFile(cwd, flags);
  const { configError } = config;
  let options: CheckedOptions = {};
  let optionsError: string | undefined;
  if (!configError) {
    try {
      // getPartialOptions reads only these fields of a build's context.
      options = getPartialOptions({
        argv,
        env: buildEnvironment(cwd),
        flags,
        configuration: config.configuration,
        extraOptions: {},
        log: silentLog(),
      } as unknown as InitialContext);
    } catch (err) {
      optionsError = errorMessage(err);
    }
  }
  const flagKeys = new Set(
    Object.entries(flags)
      .filter(([key, value]) => !FLAG_DEFAULTS.has(key) && value !== undefined)
      .filter(([, value]) => !Array.isArray(value) || value.length > 0)
      .map(([key]) => key)
  );
  const packageJsonPath = nearestPackageJson(cwd, input.gitRoot);
  const packageJson = packageJsonPath ? readJson(packageJsonPath) : undefined;

  return {
    configError,
    optionsError,
    doctorInput: {
      cwd,
      gitRoot: input.gitRoot,
      ...(await countGlobMatches(input.gitRoot, cwd, options)),
      branch: input.branch,
      configFile: config.configFile,
      configJson: config.configJson,
      configKeys: new Set(Object.keys(config.configJson ?? {})),
      flagKeys,
      configEditable: config.configEditable,
      options,
      packageJsonPath,
      packageJson,
      chromaticVersion: await chromaticVersion(packageJsonPath, packageJson),
      archiveLocation:
        process.env.CHROMATIC_ARCHIVE_LOCATION ?? dotEnvironment(cwd).CHROMATIC_ARCHIVE_LOCATION,
      prebuilt: !!options.storybookBuildDir || scriptUploadsPrebuilt(packageJson?.scripts),
      ...(await resolveStorybook(input.gitRoot, options, packageJson)),
    },
  };
}

/**
 * The chromatic version to add when it isn't a dependency: this CLI's own, unless the package
 * manager's minimum release age refuses it.
 *
 * @param packageJsonPath The project's package.json.
 * @param packageJson Its contents.
 *
 * @returns The version.
 */
async function chromaticVersion(packageJsonPath?: string, packageJson?: Record<string, any>) {
  const deps = { ...packageJson?.dependencies, ...packageJson?.devDependencies };
  if (!packageJsonPath || deps.chromatic) return pkg.version;
  return (
    (await installableVersion('chromatic', path.dirname(packageJsonPath), pkg.version)) ??
    pkg.version
  );
}

/**
 * Whether a package script runs Chromatic on a prebuilt Storybook, which may have no stats file.
 *
 * @param scripts The package's scripts.
 *
 * @returns True when a chromatic script passes -d or --storybook-build-dir.
 */
function scriptUploadsPrebuilt(scripts: Record<string, string> = {}) {
  return Object.values(scripts).some(
    (script) =>
      /\bchromatic\b/.test(script) && /(?:^|\s)(?:-d|--storybook-build-dir)(?=[\s=]|$)/.test(script)
  );
}

/**
 * Other globs that may be what an untraced or externals glob meant: the same glob from the
 * project's directory, or anywhere in the repository.
 *
 * @param glob The glob as written.
 * @param prefix The project's directory from the repository root, or '.'.
 *
 * @returns The suggestions, most specific first.
 */
export function globSuggestions(glob: string, prefix: string) {
  const bare = glob.replace(/^\.\//, '');
  return [
    prefix === '.' ? undefined : `${prefix}/${bare}`,
    glob.startsWith('**/') ? undefined : `**/${bare}`,
  ].filter((suggestion) => suggestion !== undefined);
}

/**
 * Counts the repository files each untraced and externals glob, and each suggestion for it,
 * matches, the way TurboSnap matches them, in one pass over the repository.
 *
 * @param gitRoot Absolute repository root, if in a git repository.
 * @param cwd Working directory Chromatic runs from.
 * @param options The options a build would see.
 *
 * @returns Each glob's count, and the folders each `**\/` suggestion matches in.
 */
async function countGlobMatches(gitRoot: string | undefined, cwd: string, options: CheckedOptions) {
  const prefix = gitRoot ? relativeOrDot(gitRoot, cwd) : '.';
  const globs = [...(options.untraced ?? []), ...(options.externals ?? [])].flatMap((glob) => [
    glob,
    ...globSuggestions(glob, prefix),
  ]);
  const counts = new Map(globs.map((glob) => [glob, 0]));
  const folders = new Map<string, Set<string>>();
  if (!gitRoot || globs.length === 0) return { globMatches: counts, globFolders: folders };
  await forEachRepoFile(gitRoot, (file) => {
    for (const glob of counts.keys()) {
      if (!matchesFile(glob, file)) continue;
      counts.set(glob, (counts.get(glob) ?? 0) + 1);
      if (glob.startsWith('**/')) {
        const folder = matchFolder(glob.slice(3), file);
        if (folder) folders.set(glob, (folders.get(glob) ?? new Set()).add(folder));
      }
    }
  });
  return { globMatches: counts, globFolders: folders };
}

/**
 * The shallowest folder from which a glob matches a file, such as packages for styles/*.css and
 * packages/styles/a.css.
 *
 * @param glob The glob without its leading `**\/`.
 * @param file Repository-relative path.
 *
 * @returns The folder, or undefined when there's none.
 */
function matchFolder(glob: string, file: string) {
  const parts = file.split('/');
  for (let depth = 1; depth < parts.length; depth += 1) {
    const folder = parts.slice(0, depth).join('/');
    if (matchesFile(`${folder}/${glob}`, file)) return folder;
  }
  return undefined;
}

/**
 * Resolves Storybook's paths with the build's own functions, from the process's directory as in a
 * build: the config directory as getStorybookMetadata finds it, and whether storybookBuildDir
 * passes the same validation as an upload.
 *
 * @param gitRoot Repository root, if in a git repository.
 * @param options The options a build would see.
 * @param packageJson The project's package.json.
 *
 * @returns The config directory, and the error a build would hit with storybookBuildDir.
 */
async function resolveStorybook(
  gitRoot: string | undefined,
  options: CheckedOptions,
  packageJson: Record<string, any> | undefined
) {
  const log = silentLog();
  // As getOptions does: the build script only counts when Chromatic builds Storybook itself.
  const buildScriptName =
    options.storybookBuildDir || options.buildCommand
      ? options.buildScriptName
      : findBuildScriptName(packageJson?.scripts, options.buildScriptName);
  const { configDir } = findConfigFlags({ buildScriptName, packageJson: packageJson ?? {} });
  const deps = { log, options, packageJson: packageJson ?? {} } as unknown as StorybookInfoDeps;
  const storybookConfigDirectory = await findConfigDirectory(
    deps,
    getStorybookProjectRoot({ storybookBaseDir: options.storybookBaseDir, gitRootPath: gitRoot }),
    configDir
  );
  if (!options.storybookBuildDir) return { storybookConfigDirectory };
  try {
    await validateFiles(deps, { isReactNativeApp: false, sourceDir: options.storybookBuildDir });
    return { storybookConfigDirectory };
  } catch (err) {
    return {
      storybookConfigDirectory,
      buildDirectoryError: stripVTControlCharacters(errorMessage(err)),
    };
  }
}

/**
 * A fix that edits the config file, offered only when the file decides that option: a flag would
 * win over the edit, and JSON5 syntax beyond comments can't be edited in place.
 *
 * @param input What loadDoctorInput read.
 * @param key The option the fix changes.
 * @param summary What the fix does, in one line.
 * @param change Edits the parsed config in place.
 * @param options How to offer it.
 * @param options.adds True when the fix adds the key, so the file needn't have it yet.
 *
 * @returns The fix, or undefined when the config file can't safely make it.
 */
export function configFix(
  input: DoctorInput,
  key: string,
  summary: string,
  change: (json: Record<string, any>) => void,
  { adds = false }: { adds?: boolean } = {}
): Fix | undefined {
  if (!input.configEditable || input.flagKeys.has(key)) return undefined;
  if (!adds && !input.configKeys.has(key)) return undefined;
  return { summary, edits: [configEdit(input, change)] };
}

/**
 * Rewrites the config file with a change, for fixes.
 *
 * @param input What loadDoctorInput read.
 * @param change Edits the parsed config in place.
 *
 * @returns The config file's path and new text.
 */
function configEdit(input: DoctorInput, change: (json: Record<string, any>) => void) {
  // A new config file starts the way init writes one, with the schema for editor hints.
  const json = structuredClone(
    input.configJson ?? { $schema: 'https://www.chromatic.com/config-file.schema.json' }
  );
  change(json);
  const file = input.configFile ?? path.join(input.cwd, 'chromatic.config.json');
  const previous = existsSync(file) ? readFileSync(file, 'utf8') : undefined;
  return { file, content: rewriteJson(json, previous) };
}
