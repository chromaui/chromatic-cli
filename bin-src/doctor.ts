import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import * as clack from '@clack/prompts';
import meow from 'meow';

import { allowPnpRuntime } from '../node-src/lib/installedPackages';
import { meowImportMeta } from '../node-src/lib/meowImportMeta';
import parseArguments from '../node-src/lib/parseArguments';
import type { Flags } from '../node-src/types';
import pkg from '../package.json';
import {
  appliedIds,
  notOfferedFailure,
  skippedFixesMessage,
  unlockedFixesMessage,
} from './setup/apply';
import { Check, runChecks } from './setup/checks';
import { readCliVersions } from './setup/cliVersion';
import {
  describeProject,
  findProjects,
  findTestConfig,
  hasConfigFile,
  isDirectory,
  listProjectFiles,
  Project,
  runsAbove,
  scriptConfigDirectory,
  TEST_FRAMEWORKS,
} from './setup/detect';
import { loadDoctorInput } from './setup/doctorInput';
import { previewReachChecks } from './setup/previewReach';
import { buildStats, namesStatsFolder } from './setup/previewStats';
import { applyFixes, doctorCommand, printChecks, skillsHint, summarize } from './setup/report';
import { answered, color, git, readJson, relativeOrDot } from './setup/shared';
import { SubcommandFailure } from './subcommandFailure';

/**
 * Loads the options the way a build does and runs every check, without starting a Chromatic build.
 *
 * @param cwd Directory Chromatic runs from.
 * @param argv Arguments for the main command's parser; flags win over the config file.
 * @param statsDirectory Where doctor builds Storybook with stats to show what the Storybook preview
 * reaches. Only doctor shows that, not init's closing check, so without it there's no such check.
 *
 * @returns The check results.
 */
export async function collectChecks(cwd: string, argv: string[] = [], statsDirectory?: string) {
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
    if (statsDirectory) {
      // Like a build, read a Yarn Plug'n'Play project's packages through its runtime.
      allowPnpRuntime();
      // Only doctor looks up the latest release, so init's closing check makes no network call.
      doctorInput.cliVersions = await readCliVersions(doctorInput);
    }
    const checks = runChecks(doctorInput, configError, optionsError);
    if (!statsDirectory || configError || optionsError) return checks;
    return [...checks, ...(await previewReachChecks(doctorInput, statsDirectory))];
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
  // A script's -c counts even as a file, so doctor reports it; .storybook only as a folder.
  const named = scriptConfigDirectory(directory);
  return named ? existsSync(named) : isDirectory(path.join(directory, '.storybook'));
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
    if (!isDirectory(directory))
      throw new SubcommandFailure(`No directory at ${flags.project}`, { exitCode: 1 });
    return here(directory);
  }
  const dotStorybook = path.join(cwd, '.storybook');
  if (
    !gitRoot ||
    hasPathFlags(mainFlags) ||
    hasConfigFile(cwd) ||
    isDirectory(dotStorybook) ||
    // A .storybook file the build script names is this project's, so doctor reports it here.
    (existsSync(dotStorybook) && scriptConfigDirectory(cwd) === dotStorybook)
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
 * The main entrypoint for `chromatic doctor`.
 *
 * @param argv A list of arguments passed.
 */
// eslint-disable-next-line complexity, max-statements -- prototype; split into smaller steps if this ships
export async function main(argv: string[]) {
  const { flags } = meow(
    `
    Usage
      $ chromatic doctor [--fix] [--apply <id>] [options]

    Checks your Chromatic setup without starting a Chromatic build: that the config loads, that
    each option's value matches what's on disk and in git, and the git history and token around
    it. With TurboSnap on, it builds Storybook with stats into a temporary folder, unless you
    upload a prebuilt Storybook or set a build command, to show what preview pulls in.
    Run it from a project to check that project. From anywhere else in a monorepo, it asks which
    project with Chromatic set up to check. Without a terminal (in CI), pass --project instead:
    doctor lists the projects and exits 2 without checking any. In a folder with no Storybook,
    no Vitest, Playwright or Cypress config and no Chromatic setup, it points to the folder
    above where they run, or else to init, and exits 2.

    Options
      --project <dir>     Check only this project.
      --fix               Offer to fix what can be fixed, one change at a time.
                          Without a terminal (in CI), fixes are listed, not applied.
      --yes, -y           With --fix, apply every fix without asking, except fixes that
                          ask a question doctor can't answer from your files, such as how
                          CI runs Chromatic or whether to update chromatic to a new major.
                          When chromatic is behind, it updates within the installed major.
      --apply <id>        Apply the fix with this ID from the report, answering yes to its
                          question. Implies --fix; repeatable. Exits 2 if it isn't offered.
                          With --apply but not --yes, doctor applies no other fixes.

    With TurboSnap on, doctor builds Storybook with stats into a temporary folder first, the
    way a TurboSnap build does, to show what the Storybook preview imports. It also asks your
    npm registry for the latest chromatic release, to show how far behind the installed one is;
    --skip-update-check skips that.

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
        apply: { type: 'string', isMultiple: true },
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
  clack.log.message(color.muted('doctor · checking your setup without starting a Chromatic build'));

  const apply = appliedIds(argv, flags.apply);
  const fix = flags.fix || apply.length > 0;

  const found = await chooseTargets(cwd, flags, mainFlags);
  const { notSetUp } = found;
  // Several targets are all set up; one may be any folder, such as --project or a repo's root.
  if (found.targets.length === 1 && !hasProject(found.targets[0].directory, mainFlags)) {
    throw noProject(cwd, found.targets[0].directory, mainFlags);
  }
  // Without a terminal to ask which project, doctor checks one; --apply needs one to apply to.
  if (
    (!interactive && found.targets.length !== 1) ||
    (apply.length > 0 && found.targets.length === 0)
  ) {
    throw projectRequired(cwd, found);
  }
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
  // Without a terminal, which checks one project, what to say about the fixes it didn't apply.
  let skipped: string | undefined;
  for (const target of targets) {
    if (multi) clack.log.step(color.bold(color.cta(`Project ${target.label}`)));
    // When the preview check needs a stats file, build Storybook first, then report. A failed
    // build replaces only that check, here and on every recheck after a fix.
    let buildFailure: Check | undefined;
    const statsDirectory = mkdtempSync(path.join(tmpdir(), 'chromatic-doctor-'));
    const check = async () => {
      const results = await collectChecks(target.directory, argv, statsDirectory);
      return results.map((c) => (c.build && buildFailure ? buildFailure : c));
    };
    let checks = await check();
    const build = checks.find((c) => c.build)?.build;
    if (build) {
      buildFailure = await buildStats(build, target.directory);
      checks = await check();
    }
    printChecks(checks);
    let keepStats = namesStatsFolder(checks, statsDirectory);

    const applyCommand = (...ids: string[]) =>
      doctorCommand(argv, [
        '--project',
        relativeOrDot(cwd, target.directory),
        ...ids.flatMap((id) => ['--apply', id]),
      ]);
    const notOffered = notOfferedFailure(
      checks,
      apply,
      relativeOrDot(cwd, target.directory),
      applyCommand
    );
    if (fix && !notOffered && checks.some((c) => c.fix)) {
      if (flags.yes || interactive || apply.length > 0) {
        clack.log.step(color.bold('Fixes'));
        const before = checks;
        checks = await applyFixes(check, {
          cwd: target.directory,
          yes: !!flags.yes,
          apply: new Set(apply),
          applyCommand,
        });
        clack.log.step(color.bold('After fixes'));
        printChecks(checks);
        keepStats ||= namesStatsFolder(checks, statsDirectory);
        // --fix and --yes offer the fixes the applied ones unlocked; --apply names them next time.
        const unlocked =
          apply.length > 0 && !flags.yes
            ? unlockedFixesMessage(before, checks, applyCommand)
            : undefined;
        if (unlocked) clack.log.info(unlocked);
      } else {
        const rerun = doctorCommand(hintArgv, ['--fix', '--yes']);
        skipped = skippedFixesMessage(checks, rerun, applyCommand);
      }
    }
    if (multi) clack.log.info(`${target.label}: ${summarize(checks)}`);
    all.push(...checks);
    // Keep the folder only when it holds the stats file the trace hint points at.
    if (!keepStats || readdirSync(statsDirectory).length === 0) {
      rmSync(statsDirectory, { recursive: true });
    }
    if (notOffered) throw notOffered;
  }

  if (notSetUp.length > 0) {
    clack.log.info(
      `Not set up with Chromatic:\n${notSetUp
        .map((p) => `${relativeOrDot(cwd, p.directory)} ${color.muted(`· ${describeProject(p)}`)}`)
        .join('\n')}\nRun ${color.cta('npx chromatic init --project <dir>')} to add one.`
    );
  }
  if (skipped) {
    clack.log.warn(skipped);
  } else if (!fix && all.some((c) => c.fix)) {
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
