import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';
import JSON5 from 'json5';

import type { InitialContext } from '../../node-src';
import { getConfiguration } from '../../node-src/lib/getConfiguration';
import getEnvironment from '../../node-src/lib/getEnvironment';
import { findBuildScriptName, getPartialOptions } from '../../node-src/lib/getOptions';
import { findConfigFlags } from '../../node-src/lib/getStorybookMetadata';
import { createLogger } from '../../node-src/lib/log';
import type { Flags, Options } from '../../node-src/types';
import type { Fix } from './checks';
import type { Framework } from './detect';
import { formatJson, readJson } from './shared';

/** The options doctor checks, merged by the main command's own option handling. */
type CheckedOptions = Partial<Options>;

export interface DoctorInput {
  cwd: string;
  gitRoot?: string;
  /** Repository files relative to the git root. */
  files: string[];
  branch?: string;
  configFile?: string;
  /** The config file's raw contents, so fixes can rewrite it. */
  configJson?: Record<string, any>;
  /** Which keys came from the config file, so fixes only touch the file for those. */
  configKeys: Set<string>;
  /** Which options were passed as flags. A flag wins over the config file, so fixing it there does nothing. */
  flagKeys: Set<string>;
  /** Whether fixes can rewrite the config file: plain JSON, or no file yet. JSONC and JSON5 would lose comments. */
  configEditable: boolean;
  options: CheckedOptions;
  packageJsonPath?: string;
  packageJson?: Record<string, any>;
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
  let configEditable = false;
  if (configFile.endsWith('.json')) {
    try {
      JSON.parse(configText);
      configEditable = true;
    } catch {
      // JSON5 syntax such as comments, which rewriting would drop.
    }
  }
  return {
    configuration,
    configFile,
    configJson: JSON5.parse<Record<string, any>>(configText),
    configEditable,
  };
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
  const environmentFile = path.join(cwd, '.env');
  const fromFile = existsSync(environmentFile) ? dotenv.parse(readFileSync(environmentFile)) : {};
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
 * @param input.files Repository files relative to the git root.
 * @param input.branch Current branch.
 * @param input.argv The arguments doctor got, which the main command's parser reads.
 * @param input.flags The main command's flags parsed from argv.
 * @param input.framework The detected framework, for E2E projects that set none in their config.
 *
 * @returns The input for runChecks, plus an error if the config file or the options are broken.
 */
export async function loadDoctorInput(input: {
  cwd: string;
  gitRoot?: string;
  files: string[];
  branch?: string;
  argv: string[];
  flags: Flags;
  framework?: Framework;
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
        log: createLogger({ ...flags, logLevel: 'silent' }),
      } as unknown as InitialContext);
    } catch (err) {
      optionsError = errorMessage(err);
    }
  }
  // An E2E project that sets nothing in its config is still an E2E project.
  const { framework } = input;
  if (framework && framework !== 'storybook' && options[framework] === undefined) {
    options = { ...options, [framework]: true };
  }

  const flagKeys = new Set(
    Object.entries(flags)
      .filter(([key, value]) => !FLAG_DEFAULTS.has(key) && value !== undefined)
      .filter(([, value]) => !Array.isArray(value) || value.length > 0)
      .map(([key]) => key)
  );
  const packageJsonPath = nearestPackageJson(cwd, input.gitRoot);

  return {
    configError,
    optionsError,
    doctorInput: {
      cwd,
      gitRoot: input.gitRoot,
      files: input.files,
      branch: input.branch,
      configFile: config.configFile,
      configJson: config.configJson,
      configKeys: new Set(Object.keys(config.configJson ?? {})),
      flagKeys,
      configEditable: config.configEditable,
      options,
      packageJsonPath,
      packageJson: packageJsonPath ? readJson(packageJsonPath) : undefined,
    },
  };
}

/**
 * Where a build looks for the Storybook config directory, in order: the main command's
 * findConfigDirectory rules, including the build script's -c.
 *
 * @param input What loadDoctorInput read.
 * @param input.cwd
 * @param input.gitRoot
 * @param input.options
 * @param input.packageJson
 *
 * @returns Absolute candidate directories.
 */
export function storybookConfigCandidates({ cwd, gitRoot, options, packageJson }: DoctorInput) {
  const projectRoot =
    options.storybookBaseDir && gitRoot ? path.resolve(gitRoot, options.storybookBaseDir) : cwd;
  if (!options.storybookConfigDir) {
    const { configDir } = findConfigFlags({
      buildScriptName: findBuildScriptName(packageJson?.scripts, options.buildScriptName),
      packageJson: packageJson ?? {},
    });
    return [path.resolve(projectRoot, configDir ?? '.storybook')];
  }
  return [
    ...new Set([
      path.resolve(projectRoot, options.storybookConfigDir),
      path.resolve(options.storybookConfigDir),
    ]),
  ];
}

/**
 * A fix that edits the config file, offered only when the file decides that option: a flag would
 * win over the edit, and rewriting JSONC or JSON5 would drop its comments.
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
 * @param input
 * @param change
 *
 * @returns
 */
function configEdit(input: DoctorInput, change: (json: Record<string, any>) => void) {
  // A new config file starts the way init writes one, with the schema for editor hints.
  const json = structuredClone(
    input.configJson ?? { $schema: 'https://www.chromatic.com/config-file.schema.json' }
  );
  change(json);
  const file = input.configFile ?? path.join(input.cwd, 'chromatic.config.json');
  const previous = existsSync(file) ? readFileSync(file, 'utf8') : undefined;
  return { file, content: formatJson(json, previous) };
}
