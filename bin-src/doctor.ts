import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import * as clack from '@clack/prompts';
import meow from 'meow';

import { findBuildScriptName } from '../node-src/lib/getOptions';
import { findConfigFlags } from '../node-src/lib/getStorybookMetadata';
import { allowPnpRuntime } from '../node-src/lib/installedPackages';
import { meowImportMeta } from '../node-src/lib/meowImportMeta';
import parseArguments from '../node-src/lib/parseArguments';
import { runCommand } from '../node-src/lib/shell/shell';
import type { Flags } from '../node-src/types';
import pkg from '../package.json';
import { Check, runChecks } from './setup/checks';
import {
  describeProject,
  findProjects,
  findTestConfig,
  listProjectFiles,
  Project,
  runsAbove,
  TEST_FRAMEWORKS,
} from './setup/detect';
import { loadDoctorInput } from './setup/doctorInput';
import { previewReachChecks } from './setup/previewReach';
import { applyFixes, doctorCommand, printChecks, skillsHint, summarize } from './setup/report';
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
 * @param withPreviewReach Whether to add what the Storybook preview reaches, which only doctor
 * shows, not init's closing check.
 *
 * @returns The check results.
 */
export async function collectChecks(cwd: string, argv: string[] = [], withPreviewReach = false) {
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
    const checks = runChecks(doctorInput, configError, optionsError);
    if (!withPreviewReach || configError || optionsError) return checks;
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

// Flags that point doctor at a project's files, so the folder doctor runs in is the project.
const hasPathFlags = (mainFlags: Flags) =>
  !!(
    mainFlags.configFile ||
    mainFlags.storybookConfigDir ||
    mainFlags.storybookBaseDir ||
    mainFlags.storybookBuildDir?.length
  );

/**
 * Whether a folder has anything for doctor to check: Chromatic set up (a config file, a script
 * that runs chromatic, or path flags), a Storybook config directory, or a Vitest, Playwright or
 * Cypress config. Reads the folder itself, so it works outside a git repository too.
 *
 * @param directory The folder doctor would check.
 * @param mainFlags The main command's flags.
 *
 * @returns True when doctor should check it.
 */
function hasProject(directory: string, mainFlags: Flags) {
  if (hasPathFlags(mainFlags) || hasConfigFile(directory) || scriptRunsChromatic(directory)) {
    return true;
  }
  if (TEST_FRAMEWORKS.some((framework) => findTestConfig(framework, directory))) return true;
  const packageJson = readJson(path.join(directory, 'package.json')) ?? {};
  const { configDir } = findConfigFlags({
    buildScriptName: findBuildScriptName(packageJson.scripts),
    packageJson,
  });
  return existsSync(path.join(directory, configDir ?? '.storybook'));
}

/**
 * Stops doctor where there's nothing to check. When tests or a Storybook in a folder above cover
 * the project, it points there, since Chromatic has to run from that folder; otherwise to init.
 * Every check would otherwise fail or offer fixes, such as adding chromatic, to a folder that
 * isn't a project.
 *
 * @param cwd The directory doctor runs from.
 * @param directory The folder doctor would check.
 * @param mainFlags The main command's flags.
 *
 * @returns The failure to throw: exit code 2, as for --project.
 */
function noProject(cwd: string, directory: string, mainFlags: Flags) {
  const relative = relativeOrDot(cwd, directory);
  const missing = `No Storybook or test config found in ${relative === '.' ? 'this folder' : relative}.`;
  const gitRoot = git(['rev-parse', '--show-toplevel'], directory);
  const above = runsAbove(
    directory,
    gitRoot,
    TEST_FRAMEWORKS.find((framework) => mainFlags[framework])
  );
  if (above) {
    const place =
      above.folder === gitRoot ? 'the repository root' : relativeOrDot(cwd, above.folder);
    return new SubcommandFailure(
      `${missing} ${above.what} from ${place} (${above.file}), so run doctor and Chromatic from ${place === '.' ? 'this folder' : place}.`,
      { exitCode: 2 }
    );
  }
  const init = relative === '.' ? 'npx chromatic init' : `npx chromatic init --project ${relative}`;
  return new SubcommandFailure(`${missing} Run ${init} to set one up.`, { exitCode: 2 });
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
  if (
    !gitRoot ||
    hasPathFlags(mainFlags) ||
    hasConfigFile(cwd) ||
    existsSync(path.join(cwd, '.storybook'))
  ) {
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
          // Relative to where doctor runs, so a label can be passed straight back as --project.
          label: `${relativeOrDot(cwd, p.directory)} ${color.muted(`· ${describeProject(p)}`)}`,
        })),
      ...configured.map((directory) => ({ directory, label: relativeOrDot(cwd, directory) })),
    ],
    notSetUp: projects.filter((p) => !isSetUp(p.directory)),
  };
}

/**
 * Lists the projects doctor could check and asks for one with --project. Without a terminal,
 * doctor checks one project, so it never runs every project's checks when only one is needed.
 *
 * @param cwd The directory doctor runs from.
 * @param found What chooseTargets found.
 * @param found.targets Projects with Chromatic set up.
 * @param found.notSetUp Projects init could set up.
 *
 * @returns The failure to throw: exit code 2, as `--json` will report "project-required".
 */
function projectRequired(
  cwd: string,
  { targets, notSetUp }: Awaited<ReturnType<typeof chooseTargets>>
) {
  if (targets.length > 0) {
    clack.log.info(`Set up with Chromatic:\n${targets.map((target) => target.label).join('\n')}`);
  }
  if (notSetUp.length > 0) {
    clack.log.info(
      `Not set up with Chromatic:\n${notSetUp
        .map((p) => `${relativeOrDot(cwd, p.directory)} ${color.muted(`· ${describeProject(p)}`)}`)
        .join('\n')}\nRun ${color.cta('npx chromatic init --project <dir>')} to add one.`
    );
  }
  const count = targets.length === 0 ? 'no projects' : `${targets.length} projects`;
  return new SubcommandFailure(
    `Found ${count} with Chromatic set up. Pass --project <directory> to check one.`,
    { exitCode: 2 }
  );
}

/**
 * Runs a check's Storybook build with a spinner. When it fails, its output goes to
 * build-storybook.log, where a Chromatic build writes it.
 *
 * @param build The build a check asked for.
 * @param cwd Directory to build from.
 *
 * @returns Whether the build wrote the stats file.
 */
async function buildStats(build: NonNullable<Check['build']>, cwd: string) {
  // Without a terminal, such as in CI, a spinner prints a line per frame, so log the start instead.
  const spinner = process.stdout.isTTY ? clack.spinner() : undefined;
  const message = 'Building Storybook with stats';
  if (spinner) spinner.start(message);
  else clack.log.step(`${message}…`);
  const stop = (text: string, failed = false) => {
    if (spinner) spinner[failed ? 'error' : 'stop'](text);
    else clack.log[failed ? 'error' : 'success'](text);
  };
  try {
    await runCommand(build.command, {
      cwd,
      stdin: 'ignore',
      all: true,
      preferLocal: false,
      env: { CI: '1', NODE_ENV: process.env.STORYBOOK_NODE_ENV || 'production' },
    });
  } catch (err) {
    const logFile = path.join(cwd, 'build-storybook.log');
    writeFileSync(logFile, String((err as { all?: string }).all ?? err));
    stop(`Storybook build failed. See ${relativeOrDot(process.cwd(), logFile)}`, true);
    return false;
  }
  if (!existsSync(build.statsFile)) {
    stop(`Storybook built, but wrote no ${relativeOrDot(process.cwd(), build.statsFile)}`, true);
    return false;
  }
  stop('Built Storybook with stats');
  return true;
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
    project with Chromatic set up to check. Without a terminal (in CI), pass --project instead:
    doctor lists the projects and exits 2 without checking any. In a folder with no Storybook,
    no Vitest, Playwright or Cypress config and no Chromatic setup, it points to the folder
    above where they run, or else to init, and exits 2.

    Options
      --project <dir>     Check only this project.
      --fix               Offer to fix what can be fixed, one change at a time.
                          Without a terminal (in CI), fixes are listed, not applied.
      --yes, -y           Answer yes without asking: build Storybook with stats when
                          TurboSnap needs them and there are none, and with --fix, apply
                          every fix except those that ask how your CI runs Chromatic,
                          which need a terminal.

    Every option chromatic takes, such as --config-file, --only-changed or --build-command, is
    read the same way as in a build, and flags win over the config file.
    `,
    {
      importMeta: meowImportMeta,
      argv,
      description: 'Check your Chromatic setup without starting a Chromatic build',
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
  // Several targets are all set up; one may be any folder, such as --project or a repo's root.
  if (found.targets.length === 1 && !hasProject(found.targets[0].directory, mainFlags)) {
    throw noProject(cwd, found.targets[0].directory, mainFlags);
  }
  if (!interactive && found.targets.length !== 1) throw projectRequired(cwd, found);
  // Like init, ask which project to check when there's a terminal.
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
  let skippedBuild = false;
  let questions = false;
  for (const target of targets) {
    if (multi) clack.log.step(color.bold(color.cta(`Project ${target.label}`)));
    const check = () => collectChecks(target.directory, argv, true);
    let checks = await check();
    printChecks(checks);

    // A build can take minutes, so it only runs when someone says yes, or --yes does.
    const build = checks.find((c) => c.build)?.build;
    if (build && !flags.yes && !interactive) {
      skippedBuild = true;
    } else if (
      build &&
      (flags.yes ||
        answered(
          await clack.confirm({
            message:
              'Build Storybook with stats to check what preview imports? It can take a few minutes.',
          })
        )) &&
      (await buildStats(build, target.directory))
    ) {
      // Show only what the stats file changed, which is the preview check.
      const before = new Set(checks.map((c) => c.title));
      checks = await check();
      printChecks(checks.filter((c) => !before.has(c.title)));
    }

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
        .map((p) => `${relativeOrDot(cwd, p.directory)} ${color.muted(`· ${describeProject(p)}`)}`)
        .join('\n')}\nRun ${color.cta('npx chromatic init --project <dir>')} to add one.`
    );
  }
  if (skippedBuild) {
    clack.log.info(
      `Didn't build Storybook to check what preview imports: there's no terminal to confirm it.\nRun ${color.cta('npx chromatic doctor --yes')} to build it and check.`
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
  const failed = all.some((c) => c.status === 'fail');
  const skills = skillsHint(failed);
  if (skills) clack.log.info(skills);
  clack.outro(
    `${multi ? `${targets.length} project${targets.length === 1 ? '' : 's'} · ` : ''}${summarize(all)}`
  );
  if (failed) {
    throw new SubcommandFailure('Some checks failed', { exitCode: 1 });
  }
}
