import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import * as clack from '@clack/prompts';
import { execa } from 'execa';
import meow from 'meow';

import { meowImportMeta } from '../../node-src/lib/meowImportMeta';
import pkg from '../../package.json';
import { collectChecks } from '../doctor';
import { SubcommandFailure } from '../subcommandFailure';
import type { Check } from './checks';
import { ciSnippet, githubWorkflow } from './ciTemplates';
import {
  chromaticRunsFor,
  CI_PROVIDERS,
  describeProject,
  detectCi,
  detectPackageManager,
  findProjects,
  Framework,
  OTHER_CI,
  PACKAGE_MANAGER_COMMANDS,
  Project,
} from './detect';
import { applyFixes, printChecks, summarize } from './report';
import {
  answered,
  color,
  FileWriter,
  formatJson,
  git,
  gitignoreAdditions,
  listRepoFiles,
  relativeOrDot,
} from './shared';
import { Session, tokenStep } from './token';

const HELP = `
    Usage
      $ chromatic init [options]

    Sets up Chromatic in this repository: finds your Storybook or E2E tests, links it to a
    Chromatic project (sign in with your browser, or paste a project token), writes
    chromatic.config.json, adds the chromatic package and script, sets up CI, and
    checks the result with chromatic doctor.

    Options
      --project <dir>                  Package to set up, when the repository has several.
      --framework, -f <name>           storybook, playwright, cypress or vitest, when detection is wrong.
      --project-token, -t <token>      Use this token instead of asking. Or set CHROMATIC_PROJECT_TOKEN.
      --no-browser                     Paste a project token instead of signing in with your browser.
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

async function pickProject(session: Session, projects: Project[]): Promise<Project> {
  const { flags, interactive } = session;
  let candidates = projects;
  if (flags.framework) candidates = candidates.filter((p) => p.framework === flags.framework);
  if (flags.project) {
    const wanted = path.resolve(process.cwd(), flags.project);
    candidates = candidates.filter((p) => p.directory === wanted);
  }
  if (candidates.length === 0) {
    clack.log.error(
      projects.length === 0
        ? 'No Storybook, Playwright, Cypress or Vitest setup found in this repository.'
        : `None of the setups found match ${[flags.project, flags.framework].filter(Boolean).join(' and ')}.`
    );
    clack.log.info(
      `Set up Storybook first with ${color.cta('npm create storybook@latest')}, then run this again.`
    );
    throw new SubcommandFailure('Nothing to set up', { exitCode: 1 });
  }

  const name = (p: Project) => (p.relative === '.' ? 'the repository root' : p.relative);
  const label = (p: Project) => `${name(p)} ${color.muted(`· ${describeProject(p)}`)}`;
  const kind = candidates.every((p) => p.framework === 'storybook') ? 'Storybooks' : 'test setups';
  if (candidates.length === 1) {
    clack.log.info(`Found ${label(candidates[0])}`);
    return candidates[0];
  }

  // Prefer the one in or above where init was run.
  const cwd = process.cwd();
  const here = candidates.find(
    (p) => cwd === p.directory || cwd.startsWith(`${p.directory}${path.sep}`)
  );
  if (!interactive) {
    if (here) {
      clack.log.info(`Found ${candidates.length} ${kind}; using ${label(here)}, where init ran`);
      return here;
    }
    clack.log.error(
      `Found ${candidates.length} ${kind}:\n${candidates.map((p) => label(p)).join('\n')}`
    );
    clack.log.info(`Pick one with ${color.cta('--project <dir>')}, or run init from inside it.`);
    throw new SubcommandFailure('More than one project to set up', { exitCode: 1 });
  }
  return answered(
    await clack.select({
      message: `Found ${candidates.length} ${kind}. Which one should this Chromatic project test?`,
      initialValue: here ?? candidates[0],
      // Description in the label, not a hint: Clack shows hints only on the highlighted option.
      options: candidates.map((p) => ({ value: p, label: label(p) })),
    })
  );
}

function configStep(session: Session, project: Project) {
  const { writer } = session;
  const file = path.join(project.directory, 'chromatic.config.json');
  const previous = existsSync(file) ? readFileSync(file, 'utf8') : undefined;
  const existing = previous ? JSON.parse(previous) : {};
  const next: Record<string, any> = {
    $schema: 'https://www.chromatic.com/config-file.schema.json',
    ...existing,
  };
  // TurboSnap works with Storybook and Vitest, not with Playwright or Cypress (see the docs FAQ).
  const turboSnap = !['playwright', 'cypress'].includes(project.framework);
  if (next.onlyChanged === undefined && turboSnap) next.onlyChanged = true;
  // Not a secret: it names the project, as the Visual Tests addon writes it.
  if (session.projectId) next.projectId = session.projectId;
  if (project.framework !== 'storybook') next[project.framework] = true;
  const changed = writer.write(file, formatJson(next, previous));
  const added = Object.keys(next).filter(
    (key) => key !== '$schema' && JSON.stringify(next[key]) !== JSON.stringify(existing[key])
  );
  clack.log.success(
    changed
      ? `${writer.say(previous ? 'Updated' : 'Wrote', previous ? 'update' : 'write')} ${writer.display(file)} ${color.muted(`(${added.map((k) => `${k}: ${JSON.stringify(next[k])}`).join(', ')})`)}`
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
    return false;
  }
  writer.write(file, formatJson(json, previous));
  const what = [addScript && 'a "chromatic" script', missing.length > 0 && missing.join(' and ')]
    .filter(Boolean)
    .join(' and ');
  clack.log.success(`${writer.say('Added', 'add')} ${what} to ${writer.display(file)}`);
  return missing.length > 0;
}

async function installStep(
  session: Session,
  project: Project,
  packageManager: keyof typeof PACKAGE_MANAGER_COMMANDS
) {
  const command = packageManager === 'yarn-classic' ? 'yarn' : packageManager;
  const args = ['install'];
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
  const detected = detectCi(gitRoot, listRepoFiles(gitRoot));
  const workingDirectory = relativeOrDot(gitRoot, project.directory);
  const hint = (d: (typeof detected)[number]) => {
    if (d.files.length === 0) return undefined;
    const shown =
      d.files.length > 3 ? [...d.files.slice(0, 3), `+${d.files.length - 3} more`] : d.files;
    // A file that runs Chromatic for another package in this repo doesn't count as set up here.
    return d.chromaticFiles.length > 0
      ? `found ${shown.join(', ')} (Chromatic runs there for another project)`
      : `found ${shown.join(', ')}`;
  };

  // Chromatic should run from one CI per project: a second one builds the same commits again.
  const existing = chromaticRunsFor(detected, gitRoot, workingDirectory);
  if (existing.length > 0) {
    clack.log.info(
      `Chromatic already runs for ${workingDirectory === '.' ? 'this project' : workingDirectory} in ${existing
        .map((r) => `${r.provider.name} (${r.file})`)
        .join(', ')}. Skipped CI setup.`
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
      const name =
        workingDirectory === '.' ? 'chromatic' : `chromatic-${path.basename(project.directory)}`;
      let file = path.join(gitRoot, '.github', 'workflows', 'chromatic.yml');
      if (existsSync(file)) file = path.join(gitRoot, '.github', 'workflows', `${name}.yml`);
      writer.write(file, githubWorkflow(template));
      clack.log.success(
        `${writer.say('Wrote', 'write')} ${writer.display(file)} ${color.muted(`(on push, full git history${workingDirectory === '.' ? '' : `, runs from ${workingDirectory}`})`)}`
      );
    } else {
      clack.note(ciSnippet(provider.id, template), `${provider.name}: add this to your pipeline`);
      clack.log.info(`More for ${provider.name}: ${color.cta(provider.docs)}`);
    }
  }
  return providers;
}

/**
 * Sets the project token as a GitHub Actions secret with the user's own `gh`, so the token is
 * never shown, copied or written to a file. Only for a token read through sign-in, and only after
 * asking: it changes the repository's settings on GitHub.
 *
 * @param session The init session.
 * @param providers The CI providers set up.
 *
 * @returns Whether the secret was set.
 */
async function githubSecretStep(session: Session, providers: { id: string }[]) {
  const { linkedToken, secretName, interactive, flags, gitRoot } = session;
  if (!linkedToken || !interactive || flags.dryRun) return false;
  if (!providers.some((p) => p.id === 'github')) return false;
  let repository: string;
  try {
    // Name the repository in the question: gh picks it from the git remotes, which may surprise.
    // Its URL keeps the host, so a GitHub Enterprise repository isn't read as one on github.com.
    const { stdout } = await execa('gh', ['repo', 'view', '--json', 'url', '-q', '.url'], {
      cwd: gitRoot,
      stdin: 'ignore',
    });
    repository = stdout.trim().replace(/^https?:\/\//, '');
  } catch {
    return false;
  }
  const yes = answered(
    await clack.confirm({
      message: `Set the ${secretName} secret on ${color.bold(repository)} with ${color.cta('gh secret set')}?`,
      initialValue: true,
    })
  );
  if (!yes) return false;
  try {
    // The secret goes over stdin, never in argv where `ps` and shell history show it.
    // --repo: with several remotes, gh refuses to guess, and the prompt already named this one.
    await execa('gh', ['secret', 'set', secretName, '--repo', repository], {
      cwd: gitRoot,
      input: linkedToken,
    });
    clack.log.success(`Set the ${secretName} secret on ${repository}`);
    return true;
  } catch (err) {
    clack.log.warn(
      `gh secret set failed: ${String(err.stderr || err.shortMessage || err).split('\n')[0]}`
    );
    return false;
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
      browser: { type: 'boolean', default: true },
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
  // Each Storybook is its own Chromatic project with its own token, so each CI job needs its own
  // secret. Name it after the package, as the docs' monorepo example does.
  if (projects.length > 1 && project.relative !== '.') {
    session.secretName = `CHROMATIC_PROJECT_TOKEN_${path
      .basename(project.directory)
      .toUpperCase()
      .replaceAll(/[^A-Z0-9]+/g, '_')}`;
  }

  // 3. Token, 4. config file, 5. package.json and one install
  await tokenStep(session, project);
  configStep(session, project);
  const needsInstall = await packageStep(session, project, project.framework);
  if (needsInstall) await installStep(session, project, packageManager);

  // 6. CI, and the token secret when sign-in gave us the token
  let providers = await ciStep(session, project, packageManager);
  if (await githubSecretStep(session, providers)) {
    providers = providers.filter((p) => p.id !== 'github');
  }

  // 7. .gitignore
  const gitignore = gitignoreAdditions(gitRoot, GITIGNORE_ENTRIES);
  if (gitignore.missing.length > 0) {
    session.writer.write(gitignore.file, gitignore.content);
    clack.log.success(
      `${session.writer.say('Added', 'add')} ${gitignore.missing.join(', ')} to ${session.writer.display(gitignore.file)}`
    );
  }

  // 8. Check the result, as storybook add runs doctor
  if (flags.dryRun) {
    clack.log.info(
      `Skipped the setup check in a dry run. Run ${color.cta('npx chromatic doctor')} afterwards.`
    );
  } else {
    process.chdir(project.directory);
    // The snippet was just printed, so "no CI runs Chromatic yet" would only repeat it.
    const pasting = providers.some((p) => p.id !== 'github');
    const problemsIn = (checks: Check[]) =>
      checks.filter(
        (c) => c.status !== 'pass' && !(pasting && c.title.startsWith('No CI runs Chromatic'))
      );
    const recheck = () => collectChecks(project.directory);
    let checks = await recheck();
    clack.log.step(`Checked the setup: ${summarize(checks)}`);
    printChecks(problemsIn(checks));
    // Offer each fix like doctor --fix, then show what's left.
    if (checks.some((c) => c.fix)) {
      checks = await applyFixes(recheck, { cwd: project.directory, yes: !!flags.yes });
      const left = problemsIn(checks);
      clack.log.step(`Checked again: ${summarize(checks)}`);
      printChecks(left);
    }
  }

  // 9. Next steps
  const runFrom = relativeOrDot(startDirectory, project.directory);
  const run = PACKAGE_MANAGER_COMMANDS[packageManager].run('chromatic');
  const secretLines = providers.map(
    (p) => `  ${p.name}: ${p.secretHelp.replace('CHROMATIC_PROJECT_TOKEN', session.secretName)}`
  );
  clack.outro(
    [
      color.success(
        flags.dryRun ? 'Dry run finished. Nothing was written.' : 'Chromatic is set up.'
      ),
      ...(secretLines.length > 0
        ? ['', `Add this project's token to CI as ${session.secretName}:`, ...secretLines]
        : []),
      '',
      `Then run ${color.cta(runFrom === '.' ? run : `cd ${runFrom} && ${run}`)} to create your first baselines.`,
    ].join('\n')
  );
}
