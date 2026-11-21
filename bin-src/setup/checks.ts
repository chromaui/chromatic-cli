import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { findBuildScriptName } from '../../node-src/lib/getOptions';
import { matchesFile } from '../../node-src/lib/utilities';
import pkg from '../../package.json';
import { findChromaticRuns, runsFor } from './ci';
import { configFix, DoctorInput, storybookConfigCandidates } from './doctorInput';
import { packageJsonEdit } from './fixes';
import { relativeOrDot } from './shared';
import { valueChecks } from './valueChecks';

const MAIN_FILE = /^main\.[cm]?[jt]sx?$/;

type Status = 'pass' | 'warn' | 'fail';
export type Group = 'Loading' | 'Values' | 'Environment';

export interface Fix {
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
      title: `No Storybook found at ${at(storybookConfigCandidates(input)[0])}`,
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

  const allRuns = findChromaticRuns(gitRoot, files);
  // Only the jobs that run Chromatic from this package; in a monorepo others belong to siblings.
  const runs = runsFor(allRuns, relativeOrDot(gitRoot, input.cwd));
  if (runs.length === 0) {
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
  // A project tested from two jobs builds the same commits twice and pays for the snapshots twice.
  if (runs.length > 1) {
    checks.push({
      group: 'Environment',
      status: 'warn',
      title: `${runs.length} CI jobs run Chromatic for this project`,
      detail: `${runs.map((r) => `${r.provider.name}: ${r.file} (${r.job})`).join('\n')}\nEach push makes a duplicate build and captures snapshots twice. Keep the one that runs on every push and remove the others.`,
    });
  }
  for (const run of runs) {
    const problems: string[] = [];
    if (run.fullHistory === false) {
      problems.push(
        run.provider.id === 'gitlab'
          ? 'no GIT_DEPTH: 0, so the clone is shallow'
          : 'checkout has no fetch-depth: 0, so the clone is shallow'
      );
    }
    if (run.onPullRequest) {
      problems.push('runs on pull_request, which tests a merge commit instead of your branch');
    }
    const where = `${run.file} (${run.job})`;
    checks.push(
      problems.length > 0
        ? {
            group: 'Environment',
            status: 'warn',
            title: `${run.provider.name}: ${where}`,
            detail: problems.join('\n'),
            // Only the clone depth has an automatic fix; which events trigger a build is a choice.
            fix:
              run.fullHistory === false && run.fullHistoryFix
                ? {
                    summary: `Clone full history in ${where}`,
                    edits: [{ file: path.join(gitRoot, run.file), content: run.fullHistoryFix }],
                  }
                : undefined,
          }
        : {
            group: 'Environment',
            status: 'pass',
            title: `${run.provider.name} runs Chromatic (${where})`,
          }
    );
  }
  return checks;
}

/**
 * Runs every check doctor knows, in Storybook doctor's order: can the config load, are its values
 * right, then the environment around it.
 *
 * @param input What loadDoctorInput read.
 * @param configError The config file error, if it failed to load.
 * @param optionsError
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
