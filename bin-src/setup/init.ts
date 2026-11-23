import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import * as clack from '@clack/prompts';
import { execa } from 'execa';
import JSON5 from 'json5';
import meow from 'meow';

import { meowImportMeta } from '../../node-src/lib/meowImportMeta';
import pkg from '../../package.json';
import { collectChecks } from '../doctor';
import { SubcommandFailure } from '../subcommandFailure';
import type { Check } from './checks';
import {
  detectPackageManager,
  findProjects,
  listProjectFiles,
  PACKAGE_MANAGER_COMMANDS,
  Project,
} from './detect';
import { pickProject } from './project';
import { applyFixes, printChecks, showEdits, summarize } from './report';
import {
  answered,
  chromaticScript,
  color,
  FileWriter,
  git,
  gitignoreAdditions,
  isEditableJson,
  readJson,
  relativeOrDot,
  rewriteJson,
} from './shared';
import { Session, tokenStep } from './token';

const HELP = `
    Usage
      $ chromatic init [options]

    Sets up Chromatic in this repository: finds your Storybook or E2E tests, checks your project
    token, writes chromatic.config.json, adds the chromatic package and script, and checks the
    result with chromatic doctor. It doesn't set up CI; it links to the steps for yours.

    Options
      --project <dir>                  Package to set up, when the repository has several.
      --framework, -f <name>           storybook, playwright, cypress or vitest, when detection is wrong.
      --project-token, -t <token>      Use this token instead of asking. Or set CHROMATIC_PROJECT_TOKEN.
      --skip-install                   Edit package.json but don't run the install.
      --dry-run                        Show what would change without writing anything.
      --yes, -y                        Accept every default and change without asking, except fixes
                                       that ask how CI runs Chromatic.
`;

const GITIGNORE_ENTRIES = [
  'build-storybook.log',
  'chromatic.log',
  'chromatic-build-*.xml',
  'chromatic-diagnostics.json',
];

/**
 * The config file init edits: the one the main command reads, or a new chromatic.config.json.
 *
 * @param directory The project's directory.
 *
 * @returns The file, its text, and its parsed JSON, which is undefined when init mustn't rewrite it.
 */
function existingConfig(directory: string) {
  const file =
    ['chromatic.config.json', 'chromatic.config.jsonc', 'chromatic.config.json5']
      .map((name) => path.join(directory, name))
      .find((candidate) => existsSync(candidate)) ?? path.join(directory, 'chromatic.config.json');
  if (!existsSync(file)) return { file, json: {} };
  const previous = readFileSync(file, 'utf8');
  let parsed: Record<string, any> | undefined;
  try {
    parsed = JSON5.parse<Record<string, any>>(previous);
  } catch {
    // The user's to fix; doctor reports it.
  }
  // JSON and JSONC are edited in place, keeping comments; other JSON5 syntax can't be.
  const editable = parsed !== undefined && isEditableJson(previous);
  return { file, previous, parsed, json: editable ? parsed : undefined };
}

/**
 * Shows a change to a file the user already has and asks before making it. A new file, or a run
 * without a terminal, with --yes, or in a dry run, doesn't ask.
 *
 * @param session The setup session.
 * @param title What the change does.
 * @param edit The file and its new content.
 * @param edit.file The file.
 * @param edit.content Its new content.
 * @param question What to ask.
 *
 * @returns Whether to make the change.
 */
async function confirmEdit(
  session: Session,
  title: string,
  edit: { file: string; content: string },
  question: string
) {
  if (!session.interactive || session.flags.dryRun || !existsSync(edit.file)) return true;
  if (readFileSync(edit.file, 'utf8') === edit.content) return true;
  showEdits(title, [edit], process.cwd());
  return answered(await clack.confirm({ message: question }));
}

const describe = (keys: string[], values: Record<string, any>) =>
  keys.map((key) => `"${key}": ${JSON.stringify(values[key])}`).join(', ');

function explainUnedited(
  file: string,
  parsed: Record<string, any> | undefined,
  wanted: Record<string, any>
) {
  const missing = Object.keys(wanted).filter((key) => parsed?.[key] !== wanted[key]);
  if (!parsed) {
    clack.log.warn(
      `${file} doesn't parse, so init left it as it is. Run ${color.cta('npx chromatic doctor')} to see why.`
    );
  } else if (missing.length > 0) {
    clack.log.warn(
      `Set ${describe(missing, wanted)} in ${file}. init can't edit JSON5 syntax such as unquoted keys, so it left the file as it is.`
    );
  } else {
    clack.log.success(`${file} already has what Chromatic needs`);
  }
}

async function configStep(session: Session, project: Project) {
  const { writer } = session;
  const { file, previous, parsed, json: existing } = existingConfig(project.directory);
  // TurboSnap comes from doctor's fix in the closing check, which asks how CI runs Chromatic
  // first: a prebuilt Storybook may have no stats file, and TurboSnap fails the build without one.
  const wanted: Record<string, any> =
    project.framework === 'storybook' ? {} : { [project.framework]: true };
  if (!existing) {
    explainUnedited(writer.display(file), parsed, wanted);
    return;
  }
  const next: Record<string, any> = {
    $schema: 'https://www.chromatic.com/config-file.schema.json',
    ...existing,
  };
  // The framework flag init picked wins over one the config already sets to false.
  Object.assign(next, wanted);
  const content = rewriteJson(next, previous);
  const added = Object.keys(next).filter((key) => key !== '$schema' && !(key in existing));
  if (
    !(await confirmEdit(
      session,
      `Update ${writer.display(file)}`,
      { file, content },
      'Apply this change?'
    ))
  ) {
    clack.log.info(`Left ${writer.display(file)} as it is.`);
    return;
  }
  const changed = writer.write(file, content);
  clack.log.success(
    changed
      ? `${writer.say(previous ? 'Updated' : 'Wrote', previous ? 'update' : 'write')} ${writer.display(file)}${added.length > 0 ? ` ${color.muted(`(${describe(added, next)})`)}` : ''}`
      : `${writer.display(file)} already has what Chromatic needs`
  );
}

async function latestVersion(name: string) {
  try {
    const response = await fetch(`https://registry.npmjs.org/${name}/latest`, {
      signal: AbortSignal.timeout(5000),
    });
    const latest = await response.json();
    return `^${latest.version}`;
  } catch {
    return 'latest';
  }
}

/**
 * Whether init should add a "chromatic" script: none of the scripts runs a build, and none is
 * called "chromatic" already. Init never replaces one that runs something else, such as
 * `chromatic init`, and says so.
 *
 * @param scripts The package's scripts.
 * @param display The package.json, as shown to the user.
 *
 * @returns Whether to add the script.
 */
function needsScript(scripts: Record<string, string> = {}, display: string) {
  if (chromaticScript(scripts)) return false;
  if (!scripts.chromatic) return true;
  clack.log.warn(
    `The "chromatic" script in ${display} doesn't run a build, so init leaves it as it is`
  );
  return false;
}

/**
 * Asks before adding a "chromatic" script to package.json.
 *
 * @param session The setup session.
 * @param file The package.json.
 * @param command What the script runs.
 * @param question What to ask.
 *
 * @returns Whether init added it.
 */
async function scriptStep(session: Session, file: string, command: string, question: string) {
  const { writer } = session;
  const previous = readFileSync(file, 'utf8');
  const json = JSON.parse(previous);
  json.scripts = { ...json.scripts, chromatic: command };
  const content = rewriteJson(json, previous);
  if (!(await confirmEdit(session, 'Add a "chromatic" script', { file, content }, question))) {
    clack.log.info(`Left ${writer.display(file)} as it is.`);
    return false;
  }
  writer.write(file, content);
  clack.log.success(
    `${writer.say('Added', 'add')} a "chromatic" script ${color.muted(`(${command})`)} to ${writer.display(file)}`
  );
  return true;
}

/**
 * After a no to installing: without an install, a script can run the latest release. E2E tests
 * need their package installed, though, and the docs recommend installing the CLI alongside it.
 *
 * @param session The setup session.
 * @param project The project being set up.
 * @param dlx The package manager's npx, such as `pnpm dlx`.
 * @param declined What the user said no to.
 * @param declined.what The packages and script init would have added.
 * @param declined.addScript Whether that included a "chromatic" script.
 */
async function declinedInstall(
  session: Session,
  project: Project,
  dlx: string,
  { what, addScript }: { what: string; addScript: boolean }
) {
  const file = path.join(project.directory, 'package.json');
  if (addScript && project.framework === 'storybook') {
    const command = `${dlx} chromatic@latest`;
    await scriptStep(
      session,
      file,
      command,
      `Add a "chromatic" script that runs ${command} instead?`
    );
  } else {
    clack.log.info(
      `Left ${session.writer.display(file)} as it is. Add ${what} yourself, then install.`
    );
  }
}

/**
 * Adds the chromatic package (and the E2E package) and a "chromatic" script to package.json. When
 * the user doesn't want chromatic installed, a Storybook project can run the latest release
 * through the package manager's npx instead, so init offers just that script.
 *
 * @param session The setup session.
 * @param project The project being set up.
 * @param dlx The package manager's npx, such as `pnpm dlx`.
 *
 * @returns Whether to run the install.
 */
async function packageStep(session: Session, project: Project, dlx: string) {
  const { writer } = session;
  const file = path.join(project.directory, 'package.json');
  const display = writer.display(file);
  const previous = readFileSync(file, 'utf8');
  const json = JSON.parse(previous);
  const wanted: Record<string, string> = { chromatic: `^${pkg.version}` };
  if (project.framework !== 'storybook')
    wanted[`@chromatic-com/${project.framework}`] = await latestVersion(
      `@chromatic-com/${project.framework}`
    );
  const present = { ...json.dependencies, ...json.devDependencies };
  const missing = Object.keys(wanted).filter((name) => !present[name]);
  const existingScript = chromaticScript(json.scripts);
  const addScript = needsScript(json.scripts, display);
  if (missing.length === 0) {
    // A no to the script means no install either; with nothing to add, install in case an earlier
    // run's install failed.
    if (addScript) return scriptStep(session, file, 'chromatic', `Add it to ${display}?`);
    if (existingScript)
      clack.log.success(
        `${display} already has chromatic and a script that runs it ("${existingScript}")`
      );
    return true;
  }

  // Install the packages first, with a script that runs the installed CLI.
  json.devDependencies = {
    ...json.devDependencies,
    ...Object.fromEntries(missing.map((n) => [n, wanted[n]])),
  };
  if (addScript) json.scripts = { ...json.scripts, chromatic: 'chromatic' };
  const content = rewriteJson(json, previous);
  const what = `${missing.join(' and ')}${addScript ? ' and a "chromatic" script' : ''}`;
  const question = `Add ${what} to ${display}${session.flags.skipInstall ? '' : ', then install'}?`;
  if (await confirmEdit(session, `Install ${missing.join(' and ')}`, { file, content }, question)) {
    writer.write(file, content);
    clack.log.success(`${writer.say('Added', 'add')} ${what} to ${display}`);
    return true;
  }
  await declinedInstall(session, project, dlx, { what, addScript });
  return false;
}

const INSTALL_MUTABLE: Partial<Record<string, string[]>> = {
  pnpm: ['--no-frozen-lockfile'],
  yarn: ['--no-immutable'],
};

async function installStep(
  session: Session,
  project: Project,
  packageManager: keyof typeof PACKAGE_MANAGER_COMMANDS
) {
  const command = packageManager === 'yarn-classic' ? 'yarn' : packageManager;
  // CI defaults pnpm and Yarn Berry to a frozen lockfile, which rejects the dependency init adds.
  const args = ['install', ...(INSTALL_MUTABLE[packageManager] ?? [])];
  if (session.flags.skipInstall || session.flags.dryRun) {
    clack.log.info(`Skipped installing. Run ${color.cta(`${command} ${args.join(' ')}`)} later.`);
    return;
  }
  const spinner = clack.spinner();
  spinner.start(`Installing with ${command}`);
  try {
    // No stdin, so a package manager that wants to ask something fails instead of waiting.
    await execa(command, args, { cwd: project.directory, stdin: 'ignore' });
    spinner.stop(`Installed with ${command}`);
  } catch (err) {
    spinner.error(
      `${command} install failed; your package.json changes are kept. Run it yourself to see why.`
    );
    clack.log.message(
      color.muted(
        String(err.stderr ?? err)
          .split('\n')
          .slice(-6)
          .join('\n')
      )
    );
    throw new SubcommandFailure(`${command} install failed`, { exitCode: 1 });
  }
}

/**
 * The main entrypoint for `chromatic init`: a step-by-step setup modeled on `storybook init`.
 *
 * @param argv A list of arguments passed.
 */
// eslint-disable-next-line complexity, max-statements -- prototype; split into smaller steps if this ships
export async function main(argv: string[]) {
  const { flags } = meow(HELP, {
    importMeta: meowImportMeta,
    argv,
    flags: {
      project: { type: 'string' },
      framework: {
        type: 'string',
        shortFlag: 'f',
        choices: ['storybook', 'playwright', 'cypress', 'vitest'],
      },
      projectToken: { type: 'string', shortFlag: 't' },
      skipInstall: { type: 'boolean' },
      dryRun: { type: 'boolean' },
      yes: { type: 'boolean', shortFlag: 'y' },
    },
  });
  const startDirectory = process.cwd();
  const interactive =
    !flags.yes && !!process.stdin.isTTY && !!process.stdout.isTTY && !process.env.CI;

  // Same frame title as the main command, with what this command does on the line below.
  clack.intro(`Chromatic CLI v${pkg.version}`);
  clack.log.message(
    color.muted(
      `init · setting up Chromatic${flags.dryRun ? ' (dry run: nothing will be written)' : ''}`
    )
  );

  // 1. Preflight
  const gitRoot = git(['rev-parse', '--show-toplevel'], process.cwd());
  if (!gitRoot) {
    clack.log.error(
      'This folder is not in a git repository. Chromatic uses git history to pick baselines.'
    );
    clack.log.info(`Run ${color.cta('git init')} and commit, then run this again.`);
    throw new SubcommandFailure('Not a git repository', { exitCode: 1 });
  }
  const packageManager = await detectPackageManager(gitRoot);
  clack.log.info(
    `Package manager: ${PACKAGE_MANAGER_COMMANDS[packageManager].label} ${color.muted('·')} chromatic ${pkg.version} ${color.muted('·')} Node ${process.versions.node}`
  );
  const session: Session = {
    gitRoot,
    interactive,
    writer: new FileWriter(!!flags.dryRun, process.cwd()),
    flags,
  };

  // 2. Detect
  const projects = findProjects(gitRoot, await listProjectFiles(gitRoot));
  const project = await pickProject(session, projects);

  // 3. Token, 4. config file, 5. package.json and one install
  await tokenStep(session, project);
  await configStep(session, project);
  // Install even when package.json already had everything: an earlier run's install may have failed.
  const installAccepted = await packageStep(
    session,
    project,
    PACKAGE_MANAGER_COMMANDS[packageManager].dlx
  );
  if (installAccepted) await installStep(session, project, packageManager);

  // 6. .gitignore
  const gitignore = gitignoreAdditions(gitRoot, GITIGNORE_ENTRIES);
  if (gitignore.missing.length > 0) {
    session.writer.write(gitignore.file, gitignore.content);
    clack.log.success(
      `${session.writer.say('Added', 'add')} ${gitignore.missing.join(', ')} to ${session.writer.display(gitignore.file)}`
    );
  }

  // 7. Check the result, as storybook add runs doctor
  let failed = false;
  if (flags.dryRun) {
    clack.log.info(
      `Skipped the setup check in a dry run. Run ${color.cta('npx chromatic doctor')} afterwards.`
    );
  } else {
    process.chdir(project.directory);
    const problemsIn = (checks: Check[]) => checks.filter((c) => c.status !== 'pass');
    // After a no to installing chromatic, don't offer to change package.json again.
    const packageJson = path.join(project.directory, 'package.json');
    const recheck = async () => {
      const results = await collectChecks(project.directory);
      if (installAccepted) return results;
      return results.map((check): Check => {
        const { fix, ...rest } = check;
        return fix?.edits.some((edit) => edit.file === packageJson) ? rest : check;
      });
    };
    let checks = await recheck();
    clack.log.step(`Checked the setup: ${summarize(checks)}`);
    printChecks(problemsIn(checks));
    // Offer each fix like doctor --fix, then show what's left.
    if (checks.some((c) => c.fix) && !flags.yes && !session.interactive) {
      clack.log.info(
        `Run ${color.cta('npx chromatic doctor --fix')} in a terminal to apply the fixes.`
      );
    } else if (checks.some((c) => c.fix)) {
      checks = await applyFixes(recheck, { cwd: project.directory, yes: !!flags.yes });
      const left = problemsIn(checks);
      clack.log.step(`Checked again: ${summarize(checks)}`);
      printChecks(left);
    }
    failed = checks.some((c) => c.status === 'fail');
  }

  // 8. Next steps
  const runFrom = relativeOrDot(startDirectory, project.directory);
  // The script that runs Chromatic, whatever it's called; without one, such as after a no to
  // adding one, run the CLI directly.
  const commands = PACKAGE_MANAGER_COMMANDS[packageManager];
  // A dry run didn't write the script it would add.
  const scripts = readJson(path.join(project.directory, 'package.json'))?.scripts;
  const script =
    chromaticScript(scripts) ?? (flags.dryRun && !scripts?.chromatic ? 'chromatic' : undefined);
  const run = script ? commands.run(script) : `${commands.dlx} chromatic`;
  let closing = color.success(
    flags.dryRun ? 'Dry run finished. Nothing was written.' : 'Chromatic is set up.'
  );
  if (failed)
    closing = color.error('Chromatic is set up, but a check failed. Fix it, then run doctor.');
  clack.outro(
    [
      closing,
      '',
      `Run ${color.cta(runFrom === '.' ? run : `cd ${runFrom} && ${run}`)} to create your first baselines.`,
      `Then run it in CI on every push, with the token as CHROMATIC_PROJECT_TOKEN: ${color.cta('https://www.chromatic.com/docs/ci')}`,
    ].join('\n')
  );
  // Exit like doctor, so CI doesn't take a setup that can't build for a working one.
  if (failed) throw new SubcommandFailure('Some checks failed', { exitCode: 1 });
}
