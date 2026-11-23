import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { findBuildScriptName } from '../../node-src/lib/getOptions';
import pkg from '../../package.json';
import {
  ARCHIVE_DIRECTORIES,
  E2E_CONFIG,
  findTestConfig,
  Framework,
  FRAMEWORK_NAMES,
  TEST_FRAMEWORKS,
} from './detect';
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
  /**
   * Asked in place of "Apply this fix?" when the fix is only right if the answer is yes, such as
   * how CI runs Chromatic, which doctor can't see. --yes can't answer it, so it skips the fix.
   */
  question?: string;
  /**
   * Whether the fix changes dependencies in package.json. After the fixes, doctor runs the
   * project's install once, so a CI that installs with a frozen lockfile doesn't fail on them.
   */
  install?: boolean;
}

export interface Check {
  group: Group;
  status: Status;
  title: string;
  detail?: string;
  fix?: Fix;
  /** A Storybook build that writes the stats file this check needs; doctor runs it first. */
  build?: { command: string; statsFile: string };
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
          detail: `npx downloads the latest release on every run. Pin it with your package manager.${
            input.chromaticVersion === pkg.version
              ? ''
              : ` ${pkg.version} is newer than your package manager's minimum release age allows, so the fix adds ${input.chromaticVersion}.`
          }`,
          fix: {
            summary: `Add chromatic ^${input.chromaticVersion} to devDependencies and install it`,
            install: true,
            edits: [
              packageJsonEdit(packageJsonPath, (json) => {
                json.devDependencies = {
                  ...json.devDependencies,
                  chromatic: `^${input.chromaticVersion}`,
                };
              }),
            ],
          },
        }
  );

  return [...checks, ...storybookChecks(input, deps), ...testConfigChecks(input)];
}

/**
 * Where a Vitest, Playwright or Cypress project's tests run. Each writes its archives next to its
 * config, and `chromatic --<framework>` reads them from the folder it runs in, so a config in a
 * folder above, such as the repository root, only works when Chromatic runs there too, or when
 * CHROMATIC_ARCHIVE_LOCATION points at the archives. Vitest also names files from its own folder,
 * which storybookBaseDir must match for TurboSnap.
 *
 * @param input What loadDoctorInput read.
 *
 * @returns The check, or none for a Storybook project.
 */
// eslint-disable-next-line complexity -- one branch per place the archives can be
function testConfigChecks(input: DoctorInput): Check[] {
  const framework = TEST_FRAMEWORKS.find((f) => input.options[f]);
  if (!framework) return [];
  const { cwd, gitRoot } = input;
  const name = FRAMEWORK_NAMES[framework];
  const config = findTestConfig(framework, cwd, gitRoot);
  if (!config) {
    return [
      {
        group: 'Loading',
        status: 'fail',
        title: `No ${name} config found here or above`,
        detail: `Chromatic uploads the archives ${name} captures, so the tests need a config with Chromatic's plugin in this folder or one above it.`,
      },
    ];
  }
  const runsFrom = path.dirname(config);
  if (runsFrom === cwd) {
    return [
      {
        group: 'Loading',
        status: 'pass',
        title: `Found ${name} config at ${path.basename(config)}`,
      },
    ];
  }
  const where =
    runsFrom === gitRoot ? 'the repository root' : relativeOrDot(gitRoot ?? cwd, runsFrom);
  const archives = path.join(runsFrom, ARCHIVE_DIRECTORIES[framework]);
  const location = input.archiveLocation;
  const found = location !== undefined && path.resolve(cwd, location) === archives;
  const { storybookBaseDir } = input.options;
  // Without storybookBaseDir, a build names files from the folder it runs in.
  const baseDirectory =
    storybookBaseDir === undefined ? cwd : path.resolve(gitRoot ?? cwd, storybookBaseDir);
  const baseDirectoryOk = framework !== 'vitest' || baseDirectory === runsFrom;
  const needed = [
    ...(found ? [] : [`CHROMATIC_ARCHIVE_LOCATION=${relativeOrDot(cwd, archives)}`]),
    ...(baseDirectoryOk
      ? []
      : [`"storybookBaseDir": "${relativeOrDot(gitRoot ?? cwd, runsFrom)}"`]),
  ];
  if (needed.length === 0) {
    return [
      {
        group: 'Loading',
        status: 'pass',
        title: `${name} runs from ${where}, and CHROMATIC_ARCHIVE_LOCATION points at its archives`,
      },
    ];
  }
  return [
    {
      group: 'Loading',
      status: 'fail',
      title: `${name} runs from ${where}, so its archives are there; run Chromatic from ${where}`,
      detail: `Its config is ${relativeOrDot(cwd, config)}, and a build from here looks for archives in ${ARCHIVE_DIRECTORIES[framework]}. To run Chromatic from here instead, set ${needed.join(' and ')}${location === undefined ? '; if CI already sets CHROMATIC_ARCHIVE_LOCATION, set it here too to check it' : ''}.`,
    },
  ];
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
  const main = findMainFile(configDirectory);
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

/**
 * Finds Storybook's main config in a config directory.
 *
 * @param configDirectory The Storybook config directory, such as .storybook.
 *
 * @returns The file name, or undefined when there's none.
 */
export function findMainFile(configDirectory: string) {
  return existsSync(configDirectory)
    ? readdirSync(configDirectory).find((f) => MAIN_FILE.test(f))
    : undefined;
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
      // Doctor doesn't read CI, so it can't tell whether CI sets the token.
      detail:
        "Doctor doesn't read your CI. If CI sets CHROMATIC_PROJECT_TOKEN or passes --project-token, builds there are fine. To run Chromatic here, set CHROMATIC_PROJECT_TOKEN, or put it in a gitignored .env.",
    });
  }

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

export { default as matchesBranch } from '../../node-src/lib/matchesBranch';
