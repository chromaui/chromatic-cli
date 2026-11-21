import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { findBuildScriptName } from '../../node-src/lib/getOptions';
import { matchesFile } from '../../node-src/lib/utilities';
import pkg from '../../package.json';
import { ChromaticRun } from './ci';
import { E2E_CONFIG, Framework, FRAMEWORK_NAMES } from './detect';
import { configFix, DoctorInput } from './doctorInput';
import { packageJsonEdit } from './fixes';
import { relativeOrDot } from './shared';
import { valueChecks } from './valueChecks';

const MAIN_FILE = /^main\.[cm]?[jt]sx?$/;

// An info line reports something without judging it, and isn't counted.
type Status = 'pass' | 'warn' | 'fail' | 'info';
export type Group = 'Loading' | 'Values' | 'Environment';

export interface Fix {
  /** What --fix will do, in one line. */
  summary: string;
  /** The file it changes and its new content. */
  edits: { file: string; content: string }[];
  /** Values the preview must never show, such as a token the fix moves. */
  secrets?: string[];
}

export interface Check {
  group: Group;
  status: Status;
  title: string;
  detail?: string;
  fix?: Fix;
}

function loadingChecks(input: DoctorInput, configError?: string): Check[] {
  const { cwd, packageJson, packageJsonPath } = input;
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

  return [...checks, ...storybookChecks(input, deps)];
}

/**
 * The Storybook a build would read: the prebuilt directory, or the config directory, version and
 * build script. E2E builds read none of these.
 *
 * @param input What loadDoctorInput read.
 * @param deps The project's dependencies, for the Storybook version.
 *
 * @returns One result per check.
 */
// eslint-disable-next-line complexity -- one branch per way a build finds its Storybook
function storybookChecks(input: DoctorInput, deps: Record<string, string>): Check[] {
  const { cwd, options, packageJson, packageJsonPath } = input;
  const checks: Check[] = [];
  const at = (file: string) => relativeOrDot(cwd, file);
  if (options.playwright || options.cypress || options.vitest || !packageJson || !packageJsonPath)
    return checks;
  // A prebuilt Storybook is uploaded as it is, so the build reads no Storybook source.
  // No fix either way: CI may build the folder before it runs Chromatic.
  if (options.storybookBuildDir) {
    const folder = options.storybookBuildDir;
    if (!input.buildDirectoryError) {
      checks.push({
        group: 'Loading',
        status: 'pass',
        title: `Uploads the Storybook built in ${folder}`,
      });
    } else if (existsSync(path.resolve(cwd, folder))) {
      checks.push({
        group: 'Loading',
        status: 'fail',
        title: `storybookBuildDir ${folder} isn't a Storybook build`,
        detail: input.buildDirectoryError,
      });
    } else {
      checks.push({
        group: 'Loading',
        status: 'warn',
        title: `storybookBuildDir ${folder} hasn't been built here`,
        detail: 'Build Storybook into it before Chromatic runs, as CI must.',
      });
    }
    return checks;
  }

  const configDirectory = input.storybookConfigDirectory;
  const main = existsSync(configDirectory)
    ? readdirSync(configDirectory).find((f) => MAIN_FILE.test(f))
    : undefined;
  if (main) {
    checks.push({
      group: 'Loading',
      status: 'pass',
      title: `Found Storybook at ${at(path.join(configDirectory, main))}`,
    });
  } else if (options.storybookConfigDir === undefined || existsSync(configDirectory)) {
    checks.push(noStorybookCheck(input));
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

  if (!options.buildCommand) {
    checks.push(buildScriptCheck(input, packageJsonPath, packageJson, !!main));
  }

  return checks;
}

function noStorybookCheck(input: DoctorInput): Check {
  const missing = {
    group: 'Loading' as const,
    status: 'fail' as const,
    title: `No Storybook found at ${relativeOrDot(input.cwd, input.storybookConfigDirectory)}`,
  };
  // An E2E project that doesn't say so in its options gets built as a Storybook, and fails.
  const found = [
    ...new Set(
      readdirSync(input.cwd)
        .map((file) => file.match(E2E_CONFIG)?.[2] as Framework | undefined)
        .filter((framework) => framework !== undefined)
    ),
  ];
  // With two test configs here, which one Chromatic should run is the user's call.
  const e2e = found.length === 1 ? found[0] : undefined;
  if (found.length > 1) {
    return {
      ...missing,
      detail: `This folder has ${found.map((f) => FRAMEWORK_NAMES[f]).join(' and ')} configs, but nothing sets which one Chromatic runs, so it tries to build a Storybook. Set one of ${found.map((f) => `"${f}": true`).join(', ')}.`,
    };
  }
  if (!e2e) {
    return {
      ...missing,
      detail: 'Run Chromatic from the package that contains .storybook, or set storybookConfigDir.',
    };
  }
  return {
    ...missing,
    detail: `This looks like a ${FRAMEWORK_NAMES[e2e]} project, but nothing sets "${e2e}": true, so Chromatic tries to build a Storybook.`,
    fix: configFix(
      input,
      e2e,
      `Set "${e2e}": true in the config file`,
      (json) => {
        json[e2e] = true;
      },
      { adds: true }
    ),
  };
}

function buildScriptCheck(
  input: DoctorInput,
  packageJsonPath: string,
  packageJson: Record<string, any>,
  hasStorybook: boolean
): Check {
  const scripts: Record<string, string> = packageJson.scripts ?? {};
  const scriptName = findBuildScriptName(scripts, input.options.buildScriptName);
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
      fix: configFix(
        input,
        'buildScriptName',
        `Set buildScriptName to "${other}"`,
        (json) => {
          json.buildScriptName = other;
        },
        { adds: true }
      ),
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

/**
 * Warns when two jobs build this project. A command scan can't tell two jobs in one file from two
 * branches of one job, so each scanned file counts once; a dedicated reader's jobs each count.
 *
 * @param runs The jobs that run Chromatic for this project.
 *
 * @returns The warning, if any.
 */
function duplicateRunChecks(runs: ChromaticRun[]): Check[] {
  const counted = new Map<string, ChromaticRun>();
  for (const run of runs) counted.set(run.confirmed ? `${run.file}\0${run.job}` : run.file, run);
  if (counted.size < 2) return [];
  // A project tested from two jobs builds the same commits twice and pays for the snapshots twice.
  return [
    {
      group: 'Environment',
      status: 'warn',
      title: `${counted.size} CI jobs run Chromatic for this project`,
      detail: `${[...counted.values()]
        .map((r) => `${r.provider.name}: ${r.file} (${r.job})`)
        .join(
          '\n'
        )}\nUnless they run on different events, each push makes a duplicate build. Keep the one that runs on every push.`,
    },
  ];
}

function runCheck(gitRoot: string, run: ChromaticRun): Check {
  const problems: string[] = [];
  if (run.fullHistory === false) {
    problems.push(
      run.provider.id === 'gitlab'
        ? "no GIT_DEPTH: 0, so the clone is shallow. Set it in the job's variables."
        : 'checkout has no fetch-depth: 0, so the clone is shallow'
    );
  }
  if (run.onPullRequest) {
    problems.push('runs on pull_request, which tests a merge commit instead of your branch');
  }
  const where = `${run.file} (${run.job})`;
  if (problems.length === 0) {
    return {
      group: 'Environment',
      status: 'pass',
      title: run.confirmed
        ? `${run.provider.name} runs Chromatic (${where})`
        : `${run.provider.name} looks like it runs Chromatic (${where})`,
    };
  }
  return {
    group: 'Environment',
    status: 'warn',
    title: `${run.provider.name}: ${where}`,
    detail: problems.join('\n'),
    // Only the clone depth has an automatic fix; which events trigger a build is a choice.
    fix: run.fullHistoryFix
      ? {
          summary: `Clone full history in ${where}`,
          edits: [{ file: path.join(gitRoot, run.file), content: run.fullHistoryFix }],
        }
      : undefined,
  };
}

function environmentChecks(input: DoctorInput): Check[] {
  const { gitRoot } = input;
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

  // Only the jobs that run Chromatic from this package; in a monorepo others belong to siblings.
  const { all: allRuns, runs, unreadable } = input.ci;
  if (unreadable.length > 0) {
    checks.push({
      group: 'Environment',
      status: 'warn',
      title: `Couldn't read ${unreadable.join(', ')}`,
      detail: "doctor couldn't parse it, so it can't tell whether it runs Chromatic.",
    });
  }
  // A file doctor couldn't read may run it; that's reported above.
  if (runs.length === 0 && unreadable.length === 0) {
    checks.push({
      group: 'Environment',
      status: 'warn',
      title:
        allRuns.length > 0
          ? 'No CI job runs Chromatic for this project'
          : 'No CI runs Chromatic yet',
      detail: 'Run chromatic init to add it.',
    });
  }
  // A scanned run counts for every project when its directory is unknown, but isn't a duplicate.
  const here = relativeOrDot(gitRoot, input.cwd);
  checks.push(
    ...duplicateRunChecks(runs.filter((run) => run.confirmed || run.directory === here)),
    ...runs.map((run) => runCheck(gitRoot, run))
  );
  return checks;
}

/**
 * Runs every check doctor knows, in Storybook doctor's order: can the config load, are its values
 * right, then the environment around it.
 *
 * @param input What loadDoctorInput read.
 * @param configError The config file error, if it failed to load.
 * @param optionsError Why the options don't work together, if they don't.
 *
 * @returns One result per check.
 */
export function runChecks(
  input: DoctorInput,
  configError?: string,
  optionsError?: string
): Check[] {
  const checks = [
    ...loadingChecks(input, configError),
    ...(optionsError
      ? [
          {
            group: 'Values' as const,
            status: 'fail' as const,
            title: "These options don't work together",
            detail: optionsError,
          },
        ]
      : []),
    ...(configError || optionsError ? [] : valueChecks(input)),
    ...environmentChecks(input),
  ];
  // A fix would rewrite a config file that failed to load and lose what's in it.
  return configError ? checks.map(({ fix: _fix, ...check }) => check) : checks;
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
