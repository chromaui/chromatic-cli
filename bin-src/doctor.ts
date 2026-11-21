import { existsSync } from 'node:fs';
import path from 'node:path';

import * as clack from '@clack/prompts';
import meow from 'meow';

import { meowImportMeta } from '../node-src/lib/meowImportMeta';
import parseArguments from '../node-src/lib/parseArguments';
import { allowPnpRuntime } from '../node-src/lib/turbosnap/v2/pnpRuntime';
import type { Flags } from '../node-src/types';
import pkg from '../package.json';
import { Check, runChecks } from './setup/checks';
import { readCi, runsFor } from './setup/ci';
import { describeProject, findProjects, Project } from './setup/detect';
import { loadDoctorInput } from './setup/doctorInput';
import { previewReachChecks } from './setup/previewReach';
import { applyFixes, printChecks, summarize } from './setup/report';
import { color, git, listRepoFiles, readJson, relativeOrDot } from './setup/shared';
import { SubcommandFailure } from './subcommandFailure';

const CONFIG_FILES = ['chromatic.config.json', 'chromatic.config.jsonc', 'chromatic.config.json5'];
const hasConfigFile = (directory: string) =>
  CONFIG_FILES.some((file) => existsSync(path.join(directory, file)));

/**
 * Loads the options the way a build does and runs every check, without starting a build.
 *
 * @param cwd Directory Chromatic runs from.
 * @param argv Arguments for the main command's parser; flags win over the config file.
 *
 * @returns The check results.
 */
export async function collectChecks(cwd: string, argv: string[] = []) {
  const flags = parseArguments(argv).flags;
  // --config-file names a file from where doctor runs, even when it checks another project.
  if (flags.configFile) flags.configFile = path.resolve(flags.configFile);
  // The config file and package.json are found from the process's directory, as in a build.
  const previous = process.cwd();
  process.chdir(cwd);
  try {
    const gitRoot = git(['rev-parse', '--show-toplevel'], cwd);
    const { doctorInput, configError, optionsError } = await loadDoctorInput({
      cwd,
      gitRoot,
      files: gitRoot ? listRepoFiles(gitRoot) : [],
      branch: gitRoot ? git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd) : undefined,
      argv,
      flags,
    });
    const checks = runChecks(doctorInput, configError, optionsError);
    if (configError || optionsError) return checks;
    // Like a build, read a Yarn Plug'n'Play project's packages through its runtime.
    allowPnpRuntime();
    return [...checks, ...(await previewReachChecks(doctorInput))];
  } finally {
    process.chdir(previous);
  }
}

/**
 * Whether a package's scripts run the chromatic CLI.
 *
 * @param directory The package's directory.
 *
 * @returns True when a script runs chromatic.
 */
function scriptRunsChromatic(directory: string) {
  const scripts: Record<string, string> =
    readJson(path.join(directory, 'package.json'))?.scripts ?? {};
  return Object.values(scripts).some((command) => /(^|[\s;&|])chromatic(\s|$)/.test(command));
}

/**
 * Decides what to check. From a project (a config file or .storybook here, or path flags), check
 * it. From anywhere else, check every project in the repository that has Chromatic set up, like
 * storybook automigrate does for multi-project repos.
 *
 * @param cwd Where doctor runs.
 * @param flags doctor's own flags.
 * @param mainFlags The main command's flags.
 *
 * @returns The projects to check, and the ones found without Chromatic.
 */
// eslint-disable-next-line complexity -- target selection has one branch per way to run doctor
function chooseTargets(cwd: string, flags: Record<string, any>, mainFlags: Flags) {
  const gitRoot = git(['rev-parse', '--show-toplevel'], cwd);
  const files = gitRoot ? listRepoFiles(gitRoot) : [];
  const projects = gitRoot
    ? findProjects(gitRoot, files).filter(
        (p, index, all) => all.findIndex((other) => other.directory === p.directory) === index
      )
    : [];
  const here = (directory: string) => ({
    targets: [{ directory, label: gitRoot ? relativeOrDot(gitRoot, directory) : '.' }],
    notSetUp: [] as Project[],
  });

  if (flags.project) {
    const directory = path.resolve(cwd, flags.project);
    if (!existsSync(directory))
      throw new SubcommandFailure(`No directory at ${flags.project}`, { exitCode: 1 });
    return here(directory);
  }
  const explicit =
    mainFlags.configFile ||
    mainFlags.storybookConfigDir ||
    mainFlags.storybookBaseDir ||
    mainFlags.storybookBuildDir?.length;
  if (!gitRoot || explicit || hasConfigFile(cwd) || existsSync(path.join(cwd, '.storybook'))) {
    return here(cwd);
  }

  // Inside a project's subfolder, such as packages/ui/src: check that project.
  const containing = projects
    .filter((p) => cwd === p.directory || cwd.startsWith(`${p.directory}${path.sep}`))
    .sort((a, b) => b.directory.length - a.directory.length)
    .at(0);
  if (containing) return here(containing.directory);
  if (projects.length === 0) return here(cwd);

  const { runs } = readCi(gitRoot, files);
  const isSetUp = (p: Project) =>
    hasConfigFile(p.directory) ||
    runsFor(runs, p.relative).length > 0 ||
    scriptRunsChromatic(p.directory);
  return {
    targets: projects
      .filter((p) => isSetUp(p))
      .map((p) => ({
        directory: p.directory,
        label: `${p.relative} ${color.muted(`· ${describeProject(p)}`)}`,
      })),
    notSetUp: projects.filter((p) => !isSetUp(p)),
  };
}

/**
 * The main entrypoint for `chromatic doctor`.
 *
 * @param argv A list of arguments passed.
 */
// eslint-disable-next-line complexity, max-statements -- prototype; split into smaller steps if this ships
export async function main(argv: string[]) {
  const { flags } = meow(
    `
    Usage
      $ chromatic doctor [--fix] [options]

    Checks your Chromatic setup without starting a build: that the config loads, that each
    option's value matches what's on disk and in git, and the git history, token and CI around it.
    Run it from a project to check that project, or from anywhere else in a monorepo to check
    every project with Chromatic set up.

    Options
      --project <dir>     Check only this project.
      --fix               Offer to fix what can be fixed, one change at a time.
                          Without a terminal (in CI), fixes are listed, not applied.
      --yes, -y           With --fix, apply every fix without asking.

    Every option chromatic takes, such as --config-file, --only-changed or --build-command, is
    read the same way as in a build, and flags win over the config file.
    `,
    {
      importMeta: meowImportMeta,
      argv,
      flags: {
        project: { type: 'string' },
        fix: { type: 'boolean' },
        yes: { type: 'boolean', shortFlag: 'y' },
      },
    }
  );
  // The main command's parser ignores doctor's own flags, as they're unknown to it.
  const mainFlags = parseArguments(argv).flags;

  const cwd = process.cwd();
  // Prompts only when someone can answer them; in CI a prompt would hold the job forever.
  const interactive = !!process.stdin.isTTY && !!process.stdout.isTTY && !process.env.CI;

  // Same frame title as the main command, with what this command does on the line below.
  clack.intro(`Chromatic CLI v${pkg.version}`);
  clack.log.message(color.muted('doctor · checking your setup without starting a build'));

  const { targets, notSetUp } = chooseTargets(cwd, flags, mainFlags);
  const multi = targets.length > 1 || notSetUp.length > 0;
  if (multi) {
    clack.log.info(
      `Found ${targets.length + notSetUp.length} project${targets.length + notSetUp.length === 1 ? '' : 's'}; checking the ${targets.length} with Chromatic set up.`
    );
  }

  const all: Check[] = [];
  let skippedFixes = false;
  for (const target of targets) {
    if (multi) clack.log.step(color.bold(color.cta(`Project ${target.label}`)));
    const check = () => collectChecks(target.directory, argv);
    let checks = await check();
    printChecks(checks);

    if (flags.fix && checks.some((c) => c.fix)) {
      if (flags.yes || interactive) {
        clack.log.step(color.bold('Fixes'));
        checks = await applyFixes(check, { cwd: target.directory, yes: !!flags.yes });
        clack.log.step(color.bold('After fixes'));
        printChecks(checks);
      } else {
        skippedFixes = true;
      }
    }
    if (multi) clack.log.info(`${target.label}: ${summarize(checks)}`);
    all.push(...checks);
  }

  if (notSetUp.length > 0) {
    clack.log.info(
      `Not set up with Chromatic:\n${notSetUp
        .map((p) => `${p.relative} ${color.muted(`· ${describeProject(p)}`)}`)
        .join('\n')}\nRun ${color.cta('npx chromatic init --project <dir>')} to add one.`
    );
  }
  if (skippedFixes) {
    clack.log.warn(
      `Didn't apply fixes: there's no terminal to confirm them (CI or piped input).\nRun ${color.cta('npx chromatic doctor --fix --yes')} to apply them all.`
    );
  } else if (!flags.fix && all.some((c) => c.fix)) {
    clack.log.info(`Run ${color.cta('npx chromatic doctor --fix')} to fix what's marked fixable.`);
  }

  if (targets.length === 0) {
    clack.outro(color.warning('No project has Chromatic set up yet.'));
    return;
  }
  clack.outro(
    `${multi ? `${targets.length} project${targets.length === 1 ? '' : 's'} · ` : ''}${summarize(all)}`
  );
  if (all.some((c) => c.status === 'fail')) {
    throw new SubcommandFailure('Some checks failed', { exitCode: 1 });
  }
}
