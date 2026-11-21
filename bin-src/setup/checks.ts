import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import JSON5 from 'json5';

import { getConfiguration } from '../../node-src/lib/getConfiguration';
import { matchesFile } from '../../node-src/lib/utilities';
import pkg from '../../package.json';
import { chromaticRunsFor, detectCi } from './detect';
import { githubFetchDepth, gitlabGitDepth, packageJsonEdit } from './fixes';
import { formatJson, gitignoreAdditions, readJson, relativeOrDot } from './shared';
import { valueChecks } from './valueChecks';

type Status = 'pass' | 'warn' | 'fail';
export type Group = 'Loading' | 'Values' | 'Environment';

interface Fix {
  /** What --fix will do, in one line. */
  summary: string;
  /** The file it changes and its new content. */
  edits: { file: string; content: string }[];
}

export interface Check {
  group: Group;
  status: Status;
  title: string;
  detail?: string;
  fix?: Fix;
}

/** The options doctor checks, merged the way a build merges them: flags over the config file. */
export interface CheckedOptions {
  onlyChanged?: string | boolean;
  storybookConfigDir?: string;
  storybookBuildDir?: string;
  storybookBaseDir?: string;
  buildScriptName?: string;
  buildCommand?: string;
  untraced?: string[];
  externals?: string[];
  projectToken?: string;
  playwright?: boolean;
  cypress?: boolean;
  vitest?: boolean;
}

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
  options: CheckedOptions;
  packageJsonPath?: string;
  packageJson?: Record<string, any>;
}

/** Rewrites a provider's CI file to clone full history, for providers where that's safe. */
const CLONE_DEPTH_FIXES: Partial<Record<string, (text: string) => string | undefined>> = {
  github: githubFetchDepth,
  gitlab: gitlabGitDepth,
};

const MAIN_FILE = /^main\.[cm]?[jt]sx?$/;

function nearestPackageJson(cwd: string, stopAt?: string) {
  for (let directory = cwd; ; directory = path.dirname(directory)) {
    const file = path.join(directory, 'package.json');
    if (existsSync(file)) return file;
    if (directory === stopAt || directory === path.dirname(directory)) return undefined;
  }
}

/**
 * Reads the config file and package.json the way the main command does.
 *
 * @param input What the caller already knows: working directory, git root, files, branch, flags.
 * @param input.cwd Working directory Chromatic runs from.
 * @param input.gitRoot Repository root, if in a git repository.
 * @param input.files Repository files relative to the git root.
 * @param input.branch Current branch.
 * @param input.flags Options passed on the command line.
 * @param input.configFile The --config-file value, if any.
 *
 * @returns The input for runChecks, plus a loading error if the config file is broken.
 */
export async function loadDoctorInput(input: {
  cwd: string;
  gitRoot?: string;
  files: string[];
  branch?: string;
  flags: CheckedOptions;
  configFile?: string;
}): Promise<{ doctorInput: DoctorInput; configError?: string }> {
  const { cwd, flags } = input;
  let configError: string | undefined;
  let configuration: Record<string, any> = {};
  try {
    configuration = await getConfiguration(input.configFile);
  } catch (err) {
    configError = err instanceof Error ? err.message : String(err);
  }
  const configFile = configuration.configFile
    ? path.resolve(cwd, configuration.configFile)
    : undefined;
  const configJson = configFile ? JSON5.parse(readFileSync(configFile, 'utf8')) : undefined;
  const definedFlags = Object.fromEntries(
    Object.entries(flags).filter(([, value]) => value !== undefined)
  );
  const packageJsonPath = nearestPackageJson(cwd, input.gitRoot);

  return {
    configError,
    doctorInput: {
      ...input,
      configFile,
      configJson,
      configKeys: new Set(Object.keys(configJson ?? {})),
      options: { ...configuration, ...definedFlags },
      packageJsonPath,
      packageJson: packageJsonPath ? readJson(packageJsonPath) : undefined,
    },
  };
}

/**
 * Where the build looks for the Storybook config directory, in order.
 *
 * @param root0
 * @param root0.cwd
 * @param root0.gitRoot
 * @param root0.options
 *
 * @returns
 */
export function storybookConfigCandidates({ cwd, gitRoot, options }: DoctorInput) {
  const projectRoot =
    options.storybookBaseDir && gitRoot ? path.resolve(gitRoot, options.storybookBaseDir) : cwd;
  const value = options.storybookConfigDir ?? '.storybook';
  return [...new Set([path.resolve(projectRoot, value), path.resolve(cwd, value)])];
}

// eslint-disable-next-line complexity -- prototype; split into smaller steps if this ships
function loadingChecks(input: DoctorInput, configError?: string): Check[] {
  const { cwd, options, packageJson, packageJsonPath } = input;
  const checks: Check[] = [];
  const at = (file: string) => relativeOrDot(cwd, file);

  if (configError) {
    checks.push({
      group: 'Loading',
      status: 'fail',
      title: 'Config file has errors',
      detail: configError,
    });
  } else if (input.configFile) {
    const outside = path.dirname(input.configFile) !== cwd;
    checks.push({ group: 'Loading', status: 'pass', title: `Read ${at(input.configFile)}` });
    if (outside) {
      checks.push({
        group: 'Loading',
        status: 'warn',
        title: 'Config file is in another directory',
        detail: `Only its options are read from there. The build script, Storybook and paths still resolve from ${at(cwd) === '.' ? 'this directory' : at(cwd)}.\nRun Chromatic from ${relativeOrDot(cwd, path.dirname(input.configFile))} instead (workingDir in the GitHub Action).`,
      });
    }
  } else {
    checks.push({
      group: 'Loading',
      status: 'pass',
      title: 'No config file; using flags and defaults',
    });
  }

  if (!packageJson || !packageJsonPath) {
    checks.push({ group: 'Loading', status: 'fail', title: 'No package.json found' });
    return checks;
  }

  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  checks.push(
    deps.chromatic
      ? { group: 'Loading', status: 'pass', title: `chromatic ${deps.chromatic} is a dependency` }
      : {
          group: 'Loading',
          status: 'warn',
          title: 'chromatic is not a dependency',
          detail:
            'npx downloads the latest release on every run. Pin it with your package manager.',
          fix: {
            summary: `Add chromatic ^${pkg.version} to devDependencies (then run your install)`,
            edits: [
              packageJsonEdit(packageJsonPath, (json) => {
                json.devDependencies = { ...json.devDependencies, chromatic: `^${pkg.version}` };
              }),
            ],
          },
        }
  );

  const isE2E = options.playwright || options.cypress || options.vitest;
  if (isE2E) return checks;

  // Look where the build looks (findConfigDirectory): the project root, then the working directory.
  const configDirectory = storybookConfigCandidates(input).find((directory) =>
    existsSync(directory)
  );
  const main = configDirectory
    ? readdirSync(configDirectory).find((f) => MAIN_FILE.test(f))
    : undefined;
  if (main && configDirectory) {
    checks.push({
      group: 'Loading',
      status: 'pass',
      title: `Found Storybook at ${at(path.join(configDirectory, main))}`,
    });
  } else if (options.storybookConfigDir === undefined) {
    checks.push({
      group: 'Loading',
      status: 'fail',
      title: `No Storybook found at ${at(path.join(cwd, '.storybook'))}`,
      detail: 'Run Chromatic from the package that contains .storybook, or set storybookConfigDir.',
    });
  }
  // A storybookConfigDir that points nowhere is reported once, with the other option values.

  const storybookVersion = deps.storybook;
  if (main) {
    checks.push(
      storybookVersion
        ? { group: 'Loading', status: 'pass', title: `Storybook ${storybookVersion}` }
        : {
            group: 'Loading',
            status: 'warn',
            title: 'Storybook version not found',
            detail: `"storybook" is not a dependency in ${at(packageJsonPath)}.`,
          }
    );
  }

  if (!options.storybookBuildDir && !options.buildCommand) {
    checks.push(buildScriptCheck(input, packageJsonPath, packageJson, !!main));
  }

  return checks;
}

function buildScriptCheck(
  input: DoctorInput,
  packageJsonPath: string,
  packageJson: Record<string, any>,
  hasStorybook: boolean
): Check {
  const scriptName = input.options.buildScriptName ?? 'build-storybook';
  const scripts: Record<string, string> = packageJson.scripts ?? {};
  if (scripts[scriptName]) {
    return {
      group: 'Loading',
      status: 'pass',
      title: `Builds Storybook with the "${scriptName}" script`,
    };
  }
  // A script under another name may already build Storybook, such as "build:storybook".
  const other = Object.keys(scripts).find(
    (name) => name !== 'chromatic' && /\b(storybook build|build-storybook)\b/.test(scripts[name])
  );
  const missing = {
    group: 'Loading' as const,
    status: 'fail' as const,
    title: `No "${scriptName}" script in ${relativeOrDot(input.cwd, packageJsonPath)}`,
  };
  if (other) {
    return {
      ...missing,
      detail: `The "${other}" script builds Storybook. Point buildScriptName at it.`,
      fix: {
        summary: `Set buildScriptName to "${other}"`,
        edits: [configEdit(input, (json) => (json.buildScriptName = other))],
      },
    };
  }
  return {
    ...missing,
    detail: 'Chromatic runs this script to build Storybook.',
    // storybook init adds the same script.
    fix: hasStorybook
      ? {
          summary: `Add "${scriptName}": "storybook build" to package.json`,
          edits: [
            packageJsonEdit(packageJsonPath, (json) => {
              json.scripts = { ...json.scripts, [scriptName]: 'storybook build' };
            }),
          ],
        }
      : undefined,
  };
}

// eslint-disable-next-line complexity -- prototype; split into smaller steps if this ships
function environmentChecks(input: DoctorInput): Check[] {
  const { gitRoot, files } = input;
  const checks: Check[] = [];
  if (!gitRoot) {
    return [
      {
        group: 'Environment',
        status: 'fail',
        title: 'Not a git repository',
        detail: 'Chromatic needs git history to pick baselines.',
      },
    ];
  }

  const shallow = existsSync(path.join(gitRoot, '.git', 'shallow'));
  checks.push(
    shallow
      ? {
          group: 'Environment',
          status: 'warn',
          title: 'This clone is shallow',
          detail: 'TurboSnap and baselines need full history. Fetch it with git fetch --unshallow.',
        }
      : { group: 'Environment', status: 'pass', title: 'Full git history' }
  );

  if (input.options.projectToken || process.env.CHROMATIC_PROJECT_TOKEN) {
    checks.push({ group: 'Environment', status: 'pass', title: 'Project token is set' });
  } else {
    checks.push({
      group: 'Environment',
      status: 'warn',
      title: 'No project token in this environment',
      detail: 'Set CHROMATIC_PROJECT_TOKEN, or put it in a gitignored .env for local runs.',
    });
  }

  const ci = detectCi(gitRoot, files).filter((found) => found.chromaticFiles.length > 0);
  // Only the CI configs that run Chromatic for this package; in a monorepo others belong to
  // sibling projects.
  const runs = chromaticRunsFor(ci, gitRoot, relativeOrDot(gitRoot, input.cwd));
  if (runs.length === 0) {
    checks.push({
      group: 'Environment',
      status: 'warn',
      title: ci.length > 0 ? 'No CI runs Chromatic for this project' : 'No CI runs Chromatic yet',
      detail: 'Run chromatic init to add it.',
    });
  }
  // A project tested from two CIs builds the same commits twice and pays for the snapshots twice.
  if (runs.length > 1) {
    checks.push({
      group: 'Environment',
      status: 'warn',
      title: `${runs.length} CI configs run Chromatic for this project`,
      detail: `${runs.map((r) => `${r.provider.name}: ${r.file}`).join('\n')}\nEach push makes a duplicate build and captures snapshots twice. Keep the one that runs on every push and remove the others.`,
    });
  }
  {
    for (const { provider, file } of runs) {
      // Drop comments, so a comment that mentions pull_request doesn't count as a trigger.
      const raw = readFileSync(path.join(gitRoot, file), 'utf8');
      const text = raw.replaceAll(/(^|\s)#.*$/gm, '$1');
      const problems: string[] = [];
      if (provider.id === 'github' && !/fetch-depth:\s*0/.test(text))
        problems.push('checkout has no fetch-depth: 0, so the clone is shallow');
      if (provider.id === 'github' && /\bpull_request\b/.test(text))
        problems.push('runs on pull_request, which tests a merge commit instead of your branch');
      if (provider.id === 'gitlab' && !/GIT_DEPTH:\s*["']?0/.test(text))
        problems.push('no GIT_DEPTH: 0, so the clone is shallow');
      const fixed = CLONE_DEPTH_FIXES[provider.id]?.(raw);
      // Only the clone depth has a safe automatic fix; which events trigger a build is a choice.
      const shallowProblem = problems.some((problem) => problem.includes('shallow'));
      checks.push(
        problems.length > 0
          ? {
              group: 'Environment',
              status: 'warn',
              title: `${provider.name}: ${file}`,
              detail: problems.join('\n'),
              fix:
                shallowProblem && fixed
                  ? {
                      summary: `Clone full history in ${file}`,
                      edits: [{ file: path.join(gitRoot, file), content: fixed }],
                    }
                  : undefined,
            }
          : {
              group: 'Environment',
              status: 'pass',
              title: `${provider.name} runs Chromatic (${file})`,
            }
      );
    }
  }
  return checks;
}

/**
 * Runs every check doctor knows, in Storybook doctor's order: can the config load, are its values
 * right, then the environment around it.
 *
 * @param input What loadDoctorInput read.
 * @param configError The config file error, if it failed to load.
 *
 * @returns One result per check.
 */
export function runChecks(input: DoctorInput, configError?: string): Check[] {
  const checks = [
    ...loadingChecks(input, configError),
    ...(configError ? [] : valueChecks(input)),
    ...environmentChecks(input),
  ];
  // A fix would rewrite a config file that failed to load and lose what's in it.
  return configError ? checks.map(({ fix: _fix, ...check }) => check) : checks;
}

/**
 * Rewrites the config file with a change, for fixes.
 *
 * @param input
 * @param change
 *
 * @returns
 */
export function configEdit(input: DoctorInput, change: (json: Record<string, any>) => void) {
  // A new config file starts the way init writes one, with the schema for editor hints.
  const json = structuredClone(
    input.configJson ?? { $schema: 'https://www.chromatic.com/config-file.schema.json' }
  );
  change(json);
  const file = input.configFile ?? path.join(input.cwd, 'chromatic.config.json');
  const previous = existsSync(file) ? readFileSync(file, 'utf8') : undefined;
  return { file, content: formatJson(json, previous) };
}

/**
 * Edits that save a token in .env next to where Chromatic runs, and gitignore it.
 *
 * @param input
 * @param token
 *
 * @returns
 */
export function environmentTokenEdits(input: DoctorInput, token: string) {
  const environmentFile = path.join(input.cwd, '.env');
  const text = existsSync(environmentFile) ? readFileSync(environmentFile, 'utf8') : '';
  const line = `CHROMATIC_PROJECT_TOKEN=${token}`;
  const environmentContent = /^CHROMATIC_PROJECT_TOKEN=/m.test(text)
    ? text.replace(/^CHROMATIC_PROJECT_TOKEN=.*$/m, line)
    : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`;
  const edits = [{ file: environmentFile, content: environmentContent }];
  if (input.gitRoot) {
    const ignored = relativeOrDot(input.gitRoot, environmentFile);
    const gitignore = gitignoreAdditions(input.gitRoot, [
      ignored === '.env' ? '.env' : `/${ignored}`,
    ]);
    if (gitignore.missing.length > 0)
      edits.push({ file: gitignore.file, content: gitignore.content });
  }
  return edits;
}

/**
 * Counts the repository files a glob matches, the way TurboSnap matches them.
 *
 * @param files Repository files relative to the git root.
 * @param glob The glob from untraced or externals.
 *
 * @returns How many files match.
 */
export function countMatches(files: string[], glob: string) {
  return files.filter((file) => matchesFile(glob, file)).length;
}

export { default as matchesBranch } from '../../node-src/lib/matchesBranch';
