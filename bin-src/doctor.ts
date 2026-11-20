import { existsSync } from 'node:fs';
import path from 'node:path';

import * as clack from '@clack/prompts';
import meow from 'meow';

import { meowImportMeta } from '../node-src/lib/meowImportMeta';
import pkg from '../package.json';
import { Check, CheckedOptions, loadDoctorInput, runChecks } from './setup/checks';
import { chromaticRunsFor, describeProject, detectCi, findProjects, Project } from './setup/detect';
import { applyFixes, printChecks, summarize } from './setup/report';
import { color, git, listRepoFiles, relativeOrDot } from './setup/shared';
import { SubcommandFailure } from './subcommandFailure';

const CONFIG_FILES = ['chromatic.config.json', 'chromatic.config.jsonc', 'chromatic.config.json5'];
const hasConfigFile = (directory: string) =>
  CONFIG_FILES.some((file) => existsSync(path.join(directory, file)));

/**
 * Loads the config the way a build does and runs every check, without starting a build.
 *
 * @param cwd Directory Chromatic runs from.
 * @param flags Options passed on the command line, which win over the config file.
 * @param configFile The --config-file value, if any.
 *
 * @returns The check results.
 */
export async function collectChecks(cwd: string, flags: CheckedOptions = {}, configFile?: string) {
  // The config file and package.json are found from the process's directory, as in a build.
  const previous = process.cwd();
  process.chdir(cwd);
  try {
    const gitRoot = git(['rev-parse', '--show-toplevel'], cwd);
    const { doctorInput, configError } = await loadDoctorInput({
      cwd,
      gitRoot,
      files: gitRoot ? listRepoFiles(gitRoot) : [],
      branch: gitRoot ? git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd) : undefined,
      flags,
      configFile,
    });
    return runChecks(doctorInput, configError);
  } finally {
    process.chdir(previous);
  }
}

/**
 * Decides what to check. From a project (a config file or .storybook here, or path flags), check
 * it. From anywhere else, check every project in the repository that has Chromatic set up, like
 * storybook automigrate does for multi-project repos.
 *
 * @param cwd
 * @param flags
 *
 * @returns
 */
// eslint-disable-next-line complexity -- prototype; split into smaller steps if this ships
function chooseTargets(cwd: string, flags: Record<string, any>) {
  const gitRoot = git(['rev-parse', '--show-toplevel'], cwd);
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
    flags.configFile ||
    flags.storybookConfigDir ||
    flags.storybookBaseDir ||
    flags.storybookBuildDir;
  if (!gitRoot || explicit || hasConfigFile(cwd) || existsSync(path.join(cwd, '.storybook'))) {
    return here(cwd);
  }

  const files = listRepoFiles(gitRoot);
  const projects = findProjects(gitRoot, files).filter(
    (p, index, all) => all.findIndex((other) => other.directory === p.directory) === index
  );
  // Inside a project's subfolder, such as packages/ui/src: check that project.
  const containing = projects
    .filter((p) => cwd.startsWith(`${p.directory}${path.sep}`))
    .sort((a, b) => b.directory.length - a.directory.length)
    .at(0);
  if (containing) return here(containing.directory);
  if (projects.length === 0) return here(cwd);

  const ci = detectCi(gitRoot, files);
  const isSetUp = (p: Project) =>
    hasConfigFile(p.directory) || chromaticRunsFor(ci, gitRoot, p.relative).length > 0;
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
    Pass the same options you pass to chromatic; they win over the config file, as in a build.

    Options
      --project <dir>                Check only this project.
      --fix                          Offer to fix what can be fixed, one change at a time.
                                     Without a terminal (in CI), fixes are listed, not applied.
      --yes, -y                      With --fix, apply every fix without asking.
      --config-file, -c <path>       Config file to check. [chromatic.config.json]
      --only-changed [branch]        As in a build.
      --storybook-base-dir <dir>     As in a build.
      --storybook-config-dir <dir>   As in a build.
      --storybook-build-dir <dir>    As in a build.
      --build-script-name <name>     As in a build.
      --untraced <glob>              As in a build. Repeatable.
      --externals <glob>             As in a build. Repeatable.
    `,
    {
      importMeta: meowImportMeta,
      argv,
      flags: {
        project: { type: 'string' },
        fix: { type: 'boolean' },
        yes: { type: 'boolean', shortFlag: 'y' },
        configFile: { type: 'string', shortFlag: 'c' },
        onlyChanged: { type: 'string' },
        storybookBaseDir: { type: 'string' },
        storybookConfigDir: { type: 'string' },
        storybookBuildDir: { type: 'string' },
        buildScriptName: { type: 'string' },
        untraced: { type: 'string', isMultiple: true },
        externals: { type: 'string', isMultiple: true },
      },
    }
  );

  const cwd = process.cwd();
  // Prompts only when someone can answer them; in CI a prompt would hold the job forever.
  const interactive = !!process.stdin.isTTY && !!process.stdout.isTTY && !process.env.CI;
  const options: CheckedOptions = {
    // Like the main command, a bare --only-changed means true.
    onlyChanged: flags.onlyChanged === '' ? true : flags.onlyChanged,
    storybookBaseDir: flags.storybookBaseDir,
    storybookConfigDir: flags.storybookConfigDir,
    storybookBuildDir: flags.storybookBuildDir,
    buildScriptName: flags.buildScriptName,
    untraced: flags.untraced?.length ? flags.untraced : undefined,
    externals: flags.externals?.length ? flags.externals : undefined,
  };

  // Same frame title as the main command, with what this command does on the line below.
  clack.intro(`Chromatic CLI v${pkg.version}`);
  clack.log.message(color.muted('doctor · checking your setup without starting a build'));

  const { targets, notSetUp } = chooseTargets(cwd, flags);
  const multi = targets.length > 1 || notSetUp.length > 0;
  if (multi) {
    clack.log.info(
      `Found ${targets.length + notSetUp.length} projects; checking the ${targets.length} with Chromatic set up.`
    );
  }

  const all: Check[] = [];
  let skippedFixes = false;
  for (const target of targets) {
    if (multi) clack.log.step(color.bold(color.cta(`Project ${target.label}`)));
    const check = () =>
      collectChecks(
        target.directory,
        options,
        target.directory === cwd ? flags.configFile : undefined
      );
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
