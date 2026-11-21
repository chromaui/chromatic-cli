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
import { detectCi, readCi, runsFor, uploadsPrebuilt } from './ci';
import { ciJobName, ciSnippet, githubWorkflow } from './ciTemplates';
import {
  CI_PROVIDERS,
  detectPackageManager,
  findProjects,
  Framework,
  OTHER_CI,
  PACKAGE_MANAGER_COMMANDS,
  Project,
} from './detect';
import { pickProject, secretNameFor } from './project';
import { applyFixes, printChecks, summarize } from './report';
import {
  answered,
  color,
  FileWriter,
  git,
  gitignoreAdditions,
  listRepoFiles,
  readJson,
  relativeOrDot,
  rewriteJson,
} from './shared';
import { Session, tokenStep } from './token';

const HELP = `
    Usage
      $ chromatic init [options]

    Sets up Chromatic in this repository: finds your Storybook or E2E tests, checks your project
    token, writes chromatic.config.json, adds the chromatic package and script, sets up CI, and
    checks the result with chromatic doctor.

    Options
      --project <dir>                  Package to set up, when the repository has several.
      --framework, -f <name>           storybook, playwright, cypress or vitest, when detection is wrong.
      --project-token, -t <token>      Use this token instead of asking. Or set CHROMATIC_PROJECT_TOKEN.
      --ci <provider>                  The CI that runs on every push: ${CI_PROVIDERS.map((p) => p.id).join(', ')}, other.
      --skip-ci                        Don't set up CI.
      --skip-install                   Edit package.json but don't run the install.
      --dry-run                        Show what would change without writing anything.
      --yes, -y                        Accept every default without asking.
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
  // Rewriting JSONC or JSON5 as JSON would drop the comments, so only plain JSON is editable.
  const editable = file.endsWith('.json') && parsed !== undefined && isPlainJson(previous);
  return { file, previous, parsed, json: editable ? parsed : undefined };
}

function isPlainJson(text: string) {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
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
      `Set ${describe(missing, wanted)} in ${file}. init only edits plain JSON, so it left the file as it is.`
    );
  } else {
    clack.log.success(`${file} already has what Chromatic needs`);
  }
}

/**
 * Whether init should turn TurboSnap on. It works with Storybook and Vitest, not with Playwright or
 * Cypress (see the docs FAQ), and it fails a build without a stats file, which a prebuilt
 * Storybook may not have, whether the config, a CI job or the chromatic script sets it.
 *
 * @param session The init session, for the repository root.
 * @param project The project being set up.
 * @param config The existing config file, if any.
 *
 * @returns True when onlyChanged belongs in the config.
 */
function turboSnapFits(
  session: Session,
  project: Project,
  config: Record<string, any> | undefined
) {
  if (['playwright', 'cypress'].includes(project.framework) || config?.storybookBuildDir)
    return false;
  const { gitRoot } = session;
  const runs = runsFor(
    readCi(gitRoot, listRepoFiles(gitRoot)).runs,
    relativeOrDot(gitRoot, project.directory)
  );
  return !uploadsPrebuilt(runs, readJson(path.join(project.directory, 'package.json'))?.scripts);
}

function configStep(session: Session, project: Project) {
  const { writer } = session;
  const { file, previous, parsed, json: existing } = existingConfig(project.directory);
  const turboSnap = turboSnapFits(session, project, parsed);
  const wanted: Record<string, any> = {
    ...(turboSnap && { onlyChanged: true }),
    ...(project.framework !== 'storybook' && { [project.framework]: true }),
  };
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
  const changed = writer.write(file, rewriteJson(next, previous));
  const added = Object.keys(next).filter((key) => key !== '$schema' && !(key in existing));
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

async function packageStep(session: Session, project: Project, framework: Framework) {
  const { writer } = session;
  const file = path.join(project.directory, 'package.json');
  const previous = readFileSync(file, 'utf8');
  const json = JSON.parse(previous);
  const wanted: Record<string, string> = { chromatic: `^${pkg.version}` };
  if (framework !== 'storybook')
    wanted[`@chromatic-com/${framework}`] = await latestVersion(`@chromatic-com/${framework}`);
  const present = { ...json.dependencies, ...json.devDependencies };
  const missing = Object.keys(wanted).filter((name) => !present[name]);
  json.devDependencies = {
    ...json.devDependencies,
    ...Object.fromEntries(missing.map((n) => [n, wanted[n]])),
  };
  const addScript = !json.scripts?.chromatic;
  if (addScript) json.scripts = { ...json.scripts, chromatic: 'chromatic' };
  if (missing.length === 0 && !addScript) {
    clack.log.success(`${writer.display(file)} already has chromatic and its script`);
    return;
  }
  writer.write(file, rewriteJson(json, previous));
  const what = [addScript && 'a "chromatic" script', missing.length > 0 && missing.join(' and ')]
    .filter(Boolean)
    .join(' and ');
  clack.log.success(`${writer.say('Added', 'add')} ${what} to ${writer.display(file)}`);
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

// eslint-disable-next-line complexity, max-statements -- prototype; split into smaller steps if this ships
async function ciStep(
  session: Session,
  project: Project,
  packageManager: keyof typeof PACKAGE_MANAGER_COMMANDS
) {
  const { gitRoot, flags, interactive, writer } = session;
  if (flags.skipCi) return [];
  const files = listRepoFiles(gitRoot);
  const detected = detectCi(files);
  const allRuns = readCi(gitRoot, files).runs;
  const workingDirectory = relativeOrDot(gitRoot, project.directory);
  const hint = (d: (typeof detected)[number]) => {
    if (d.files.length === 0) return undefined;
    const shown =
      d.files.length > 3 ? [...d.files.slice(0, 3), `+${d.files.length - 3} more`] : d.files;
    // A file that runs Chromatic for another package in this repo doesn't count as set up here.
    return allRuns.some((run) => run.provider.id === d.provider.id)
      ? `found ${shown.join(', ')} (Chromatic runs there for another project)`
      : `found ${shown.join(', ')}`;
  };

  // Chromatic should run from one CI per project: a second one builds the same commits again.
  const existing = runsFor(allRuns, workingDirectory);
  if (existing.length > 0 && !flags.ci) {
    clack.log.info(
      `Chromatic already runs for ${workingDirectory === '.' ? 'this project' : workingDirectory} in ${existing
        .map((r) => `${r.provider.name} (${r.file}, job ${r.job})`)
        .join(', ')}. Skipped CI setup; pass --ci <provider> to set it up anyway.`
    );
    return [];
  }
  const found = detected.filter((d) => d.files.length > 0);

  let chosen: string | undefined;
  if (flags.ci) {
    chosen = flags.ci;
  } else if (interactive) {
    // Providers with config files first, so the likely answers are at the top.
    const ordered = [...found, ...detected.filter((d) => d.files.length === 0)];
    chosen = answered(
      await clack.select<string>({
        message: 'Which CI runs on every push? Chromatic should run from one.',
        initialValue: found.length === 1 ? found[0].provider.id : undefined,
        options: [
          ...ordered.map((d) => ({
            value: d.provider.id,
            // In the label, not a hint: Clack shows hints only on the highlighted option.
            label: hint(d) ? `${d.provider.name} ${color.muted(`· ${hint(d)}`)}` : d.provider.name,
          })),
          { value: OTHER_CI.id, label: OTHER_CI.name },
          { value: 'none', label: 'Skip CI for now' },
        ],
      })
    );
  } else if (found.length === 1) {
    chosen = found[0].provider.id;
  } else if (found.length > 1) {
    clack.log.warn(
      `Found ${found.map((d) => d.provider.name).join(' and ')}. Pass --ci <provider> to pick the one that runs on every push.`
    );
  }
  if (!chosen || chosen === 'none') {
    clack.log.info('Skipped CI setup.');
    return [];
  }

  const template = {
    workingDir: workingDirectory,
    packageManager,
    framework: project.framework,
    secretName: session.secretName,
  };
  const providers = [...CI_PROVIDERS, OTHER_CI].filter((p) => p.id === chosen);
  for (const provider of providers) {
    if (provider.id === 'github') {
      // Named like the secret: chromatic.yml, or chromatic-packages-ui.yml for a monorepo project.
      const name = ciJobName(session.secretName);
      const candidate = path.join(gitRoot, '.github', 'workflows', `${name}.yml`);
      const file = existsSync(candidate) ? undefined : candidate;
      if (!file) {
        pasteable(githubWorkflow(template), 'Add this as a workflow in .github/workflows');
        clack.log.warn(`${name}.yml already exists, so init didn't overwrite it.`);
        continue;
      }
      writer.write(file, githubWorkflow(template));
      clack.log.success(
        `${writer.say('Wrote', 'write')} ${writer.display(file)} ${color.muted(`(on push, full git history${workingDirectory === '.' ? '' : `, runs from ${workingDirectory}`})`)}`
      );
    } else {
      pasteable(ciSnippet(provider.id, template), `${provider.name}: add this to your pipeline`);
      clack.log.info(`More for ${provider.name}: ${color.cta(provider.docs)}`);
    }
  }
  return providers;
}

/**
 * Prints YAML to paste, outside clack's box: a note wraps long lines and adds a border, and both
 * break the YAML when it's copied.
 *
 * @param yaml The YAML.
 * @param title What to do with it.
 */
function pasteable(yaml: string, title: string) {
  clack.log.step(`${title}:`);
  process.stdout.write(`\n${yaml.trimEnd()}\n\n`);
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
      ci: { type: 'string', choices: [...CI_PROVIDERS.map((p) => p.id), 'other'] },
      skipCi: { type: 'boolean' },
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
    secretName: 'CHROMATIC_PROJECT_TOKEN',
  };

  // 2. Detect
  const projects = findProjects(gitRoot, listRepoFiles(gitRoot));
  const project = await pickProject(session, projects);
  session.secretName = secretNameFor(gitRoot, projects, project);

  // 3. Token, 4. config file, 5. package.json and one install
  await tokenStep(session, project);
  configStep(session, project);
  await packageStep(session, project, project.framework);
  // Install even when package.json already had everything: an earlier run's install may have failed.
  await installStep(session, project, packageManager);

  // 6. CI
  const providers = await ciStep(session, project, packageManager);

  // 7. .gitignore
  const gitignore = gitignoreAdditions(gitRoot, GITIGNORE_ENTRIES);
  if (gitignore.missing.length > 0) {
    session.writer.write(gitignore.file, gitignore.content);
    clack.log.success(
      `${session.writer.say('Added', 'add')} ${gitignore.missing.join(', ')} to ${session.writer.display(gitignore.file)}`
    );
  }

  // 8. Check the result, as storybook add runs doctor
  let failed = false;
  if (flags.dryRun) {
    clack.log.info(
      `Skipped the setup check in a dry run. Run ${color.cta('npx chromatic doctor')} afterwards.`
    );
  } else {
    process.chdir(project.directory);
    // The snippet was just printed, so "no CI runs Chromatic yet" would only repeat it.
    const pasting = providers.some((p) => p.id !== 'github');
    const problemsIn = (checks: Check[]) =>
      checks.filter((c) => c.status !== 'pass' && !(pasting && c.title.startsWith('No CI')));
    const recheck = () => collectChecks(project.directory);
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

  // 9. Next steps
  const runFrom = relativeOrDot(startDirectory, project.directory);
  const run = PACKAGE_MANAGER_COMMANDS[packageManager].run('chromatic');
  const secretLines = providers.map(
    (p) => `  ${p.name}: ${p.secretHelp.replace('CHROMATIC_PROJECT_TOKEN', session.secretName)}`
  );
  let closing = color.success(
    flags.dryRun ? 'Dry run finished. Nothing was written.' : 'Chromatic is set up.'
  );
  if (failed)
    closing = color.error('Chromatic is set up, but a check failed. Fix it, then run doctor.');
  clack.outro(
    [
      closing,
      ...(secretLines.length > 0
        ? ['', `Add this project's token to CI as ${session.secretName}:`, ...secretLines]
        : []),
      '',
      `Then run ${color.cta(runFrom === '.' ? run : `cd ${runFrom} && ${run}`)} to create your first baselines.`,
    ].join('\n')
  );
  // Exit like doctor, so CI doesn't take a setup that can't build for a working one.
  if (failed) throw new SubcommandFailure('Some checks failed', { exitCode: 1 });
}
