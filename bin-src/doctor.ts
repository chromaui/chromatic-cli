import { existsSync } from 'node:fs';
import path from 'node:path';

import * as clack from '@clack/prompts';
import meow from 'meow';

import { meowImportMeta } from '../node-src/lib/meowImportMeta';
import parseArguments from '../node-src/lib/parseArguments';
import type { Flags } from '../node-src/types';
import pkg from '../package.json';
import { Check, runChecks } from './setup/checks';
import { describeProject, findProjects, listProjectFiles, Project } from './setup/detect';
import { loadDoctorInput } from './setup/doctorInput';
import { applyFixes, doctorCommand, printChecks, summarize } from './setup/report';
import { answered, color, git, readJson, relativeOrDot } from './setup/shared';
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
      branch: gitRoot ? git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd) : undefined,
      argv,
      flags,
    });
    return runChecks(doctorInput, configError, optionsError);
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

// Whether a path is a folder or inside it.
const within = (folder: string, file: string) =>
  file === folder || file.startsWith(`${folder}${path.sep}`);

/**
 * The package a folder belongs to: the nearest folder at or above it with a package.json, up to
 * the repository root.
 *
 * @param directory Where to start.
 * @param gitRoot The repository root.
 *
 * @returns The package's folder, or the repository root when there's none below it.
 */
function packageDirectory(directory: string, gitRoot: string) {
  for (let current = directory; current !== gitRoot; current = path.dirname(current)) {
    if (!within(gitRoot, current)) break;
    if (existsSync(path.join(current, 'package.json'))) return current;
  }
  return gitRoot;
}

/**
 * Decides what to check. From a project (a config file or .storybook here, or path flags), check
 * it. From anywhere else, return every project in the repository that has Chromatic set up, as
 * storybook automigrate does for multi-project repos; main asks which one when it can.
 *
 * @param cwd Where doctor runs.
 * @param flags doctor's own flags.
 * @param mainFlags The main command's flags.
 *
 * @returns The projects to check, and the ones found without Chromatic.
 */
// eslint-disable-next-line complexity -- target selection has one branch per way to run doctor
async function chooseTargets(cwd: string, flags: Record<string, any>, mainFlags: Flags) {
  const gitRoot = git(['rev-parse', '--show-toplevel'], cwd);
  const files = gitRoot ? await listProjectFiles(gitRoot) : [];
  const projects = gitRoot
    ? findProjects(gitRoot, files).filter(
        (p, index, all) => all.findIndex((other) => other.directory === p.directory) === index
      )
    : [];
  const packageDirectories = files
    .filter((file) => path.basename(file) === 'package.json')
    .map((file) => path.join(gitRoot ?? '', path.dirname(file)));
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

  // Inside a project's subfolder, such as packages/ui/src: check that project. When the package
  // doctor runs in is set up itself, it owns the run, so doctor never checks or fixes the Storybook
  // of a folder above it.
  const isSetUp = (directory: string) => hasConfigFile(directory) || scriptRunsChromatic(directory);
  const ownPackage = packageDirectory(cwd, gitRoot);
  const nearest = (inside: string) =>
    projects
      .filter((p) => within(p.directory, cwd) && within(inside, p.directory))
      .sort((a, b) => b.directory.length - a.directory.length)
      .at(0);
  const ownProject = nearest(ownPackage);
  if (ownProject) return here(ownProject.directory);
  if (ownPackage !== gitRoot && isSetUp(ownPackage)) return here(ownPackage);
  const containing = nearest(gitRoot);
  if (containing) return here(containing.directory);
  if (projects.length === 0) return here(cwd);

  // A package set up with a config file or a chromatic script, but no Storybook or E2E config
  // doctor can find, is checked too, so it fails instead of going unmentioned. The root's config or
  // script, such as `turbo run chromatic`, may be for every package, so it doesn't count.
  const configured = packageDirectories
    .filter((directory) => directory !== gitRoot && isSetUp(directory))
    .filter((directory) => !projects.some((p) => p.directory === directory));
  return {
    targets: [
      ...projects
        .filter((p) => isSetUp(p.directory))
        .map((p) => ({
          directory: p.directory,
          label: `${p.relative} ${color.muted(`· ${describeProject(p)}`)}`,
        })),
      ...configured.map((directory) => ({ directory, label: relativeOrDot(gitRoot, directory) })),
    ],
    notSetUp: projects.filter((p) => !isSetUp(p.directory)),
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
    option's value matches what's on disk and in git, and the git history and token around it.
    Run it from a project to check that project. From anywhere else in a monorepo, it asks which
    project with Chromatic set up to check, or checks them all without a terminal (in CI).

    Options
      --project <dir>     Check only this project.
      --fix               Offer to fix what can be fixed, one change at a time.
                          Without a terminal (in CI), fixes are listed, not applied.
      --yes, -y           With --fix, apply every fix without asking, except fixes that
                          ask how your CI runs Chromatic, which need a terminal.

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

  const found = await chooseTargets(cwd, flags, mainFlags);
  const { notSetUp } = found;
  // Like init, ask which project to check when there's a terminal; without one, check them all.
  const targets =
    interactive && found.targets.length > 1
      ? [
          answered(
            await clack.select({
              message: `Found ${found.targets.length} projects with Chromatic set up. Which one should doctor check?`,
              // Description in the label, not a hint: Clack shows hints only on the highlighted option.
              options: found.targets.map((target) => ({ value: target, label: target.label })),
            })
          ),
        ]
      : found.targets;
  const picked = targets.length < found.targets.length;
  // One project picked from several reads like a run from inside it, without per-project headers.
  const multi = !picked && (targets.length > 1 || notSetUp.length > 0);
  // The closing hints check the same project without asking again.
  const hintArgv = picked ? [...argv, '--project', relativeOrDot(cwd, targets[0].directory)] : argv;
  if (picked) {
    clack.log.info(
      `Next time, pass ${color.cta(`--project ${relativeOrDot(cwd, targets[0].directory)}`)} to skip the question.`
    );
  } else if (multi) {
    clack.log.info(
      `Found ${targets.length + notSetUp.length} project${targets.length + notSetUp.length === 1 ? '' : 's'}; checking the ${targets.length} with Chromatic set up.`
    );
  }

  const all: Check[] = [];
  let skippedFixes = false;
  let questions = false;
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
        questions ||= checks.some((c) => c.fix?.question);
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
      `Didn't apply fixes: there's no terminal to confirm them (CI or piped input).\nRun ${color.cta(doctorCommand(hintArgv, ['--fix', '--yes']))} to apply them${questions ? ', except the ones that ask how your CI runs Chromatic, which need a terminal' : ''}.`
    );
  } else if (!flags.fix && all.some((c) => c.fix)) {
    clack.log.info(
      `Run ${color.cta(doctorCommand(hintArgv, ['--fix']))} to fix what's marked fixable.`
    );
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
