import { existsSync } from 'node:fs';
import path from 'node:path';

import * as clack from '@clack/prompts';

import { findBuildScriptName } from '../../node-src/lib/getOptions';
import { findConfigFlags } from '../../node-src/lib/getStorybookMetadata';
import { SubcommandFailure } from '../subcommandFailure';
import { findMainFile } from './checks';
import {
  describeProject,
  findTestConfig,
  foldersUp,
  Framework,
  FRAMEWORK_NAMES,
  isDirectory,
  Project,
  readConfig,
  runsAbove,
} from './detect';
import { answered, color, readJson, relativeOrDot } from './shared';
import type { Session } from './token';

/**
 * The projects --project and --framework allow. --framework picks among the setups found; with one
 * setup, or a --project folder detection missed, it overrides what detection decided.
 *
 * @param session The init session.
 * @param session.flags Its flags, for --project and --framework.
 * @param session.gitRoot The repository root.
 * @param projects Every project detection found.
 *
 * @returns The candidates to pick from.
 */
function matchFlags({ flags, gitRoot }: Session, projects: Project[]): Project[] {
  const wanted = flags.project ? path.resolve(process.cwd(), flags.project) : undefined;
  const candidates = wanted ? projects.filter((p) => p.directory === wanted) : projects;
  const framework = flags.framework as Framework | undefined;
  if (!framework) return candidates;
  const matching = candidates.filter((p) => p.framework === framework);
  if (matching.length > 0 || candidates.length > 1) return matching;
  if (candidates.length === 1) return [{ ...candidates[0], framework }];
  if (!wanted) return [];
  return [
    {
      framework,
      directory: wanted,
      relative: relativeOrDot(gitRoot, wanted),
      packageName: readJson(path.join(wanted, 'package.json'))?.name,
      evidence: '--framework',
    },
  ];
}

/**
 * Stops init when --project names a folder whose tests or Storybook run from a folder above it,
 * such as a repo-root Vitest config with test.projects, and points to that folder. Chromatic has to
 * run where the framework runs to find its archives or Storybook, so setting up the package
 * wouldn't work.
 *
 * @param session The init session.
 * @param session.flags Its flags, for --project and --framework.
 * @param session.gitRoot The repository root.
 * @param projects Every project detection found.
 */
function pointAbove({ flags, gitRoot }: Session, projects: Project[]) {
  const cwd = process.cwd();
  const wanted = flags.project ? path.resolve(cwd, flags.project) : undefined;
  if (!wanted || projects.some((p) => p.directory === wanted)) return;
  const framework = flags.framework as Framework | undefined;
  const above = runsAbove(wanted, gitRoot, framework);
  if (!above) return;
  throw ranAbove(above, gitRoot, flags.project);
}

function ranAbove(
  above: NonNullable<ReturnType<typeof runsAbove>>,
  gitRoot: string,
  project: string
) {
  const cwd = process.cwd();
  const there = relativeOrDot(cwd, above.folder);
  const place = above.folder === gitRoot ? 'the repository root' : there;
  const command = there === '.' ? 'npx chromatic init' : `npx chromatic init --project ${there}`;
  clack.log.error(
    `${above.what} from ${place} (${above.file}), so Chromatic has to run there to find ${above.framework === 'storybook' ? 'the Storybook' : 'its archives'}.`
  );
  clack.log.info(`Run ${color.cta(command)} to set it up there.`);
  return new SubcommandFailure(`Nothing to set up in ${project}`, { exitCode: 1 });
}

const SETUP_DOCS: Record<Exclude<Framework, 'storybook'>, string> = {
  playwright: 'https://www.chromatic.com/docs/playwright/',
  cypress: 'https://www.chromatic.com/docs/cypress/',
  vitest: 'https://www.chromatic.com/docs/vitest/',
};

/**
 * Whether a folder has a Storybook main config where its build will look, resolved as doctor
 * does: the config's storybookConfigDir, else the build script's -c folder or .storybook. Without
 * that build script, doctor offers to point buildScriptName at another, so any script's -c counts.
 *
 * @param directory The project's folder.
 *
 * @returns True when Storybook's main config is there.
 */
function hasStorybook(directory: string) {
  const packageJson = readJson(path.join(directory, 'package.json')) ?? {};
  const scripts: Record<string, string> = packageJson.scripts ?? {};
  const config = readConfig(directory);
  const configDirectory = (buildScriptName: string) =>
    findConfigFlags({ buildScriptName, packageJson }).configDir;
  const script = findBuildScriptName(scripts, config.buildScriptName);
  let folders: (string | undefined)[] = [
    '.storybook',
    ...Object.keys(scripts).map((name) => configDirectory(name)),
  ];
  if (typeof config.storybookConfigDir === 'string') folders = [config.storybookConfigDir];
  else if (scripts[script]) folders = [configDirectory(script) ?? '.storybook'];
  return folders.some(
    (folder) => folder !== undefined && !!findMainFile(path.resolve(directory, folder))
  );
}

/**
 * Stops init before it writes anything when the project can't be set up where it is: its Storybook
 * or test framework has no config here or above, the config is in a folder above (so Chromatic has
 * to run there), or the folder has no package.json for chromatic and its script.
 *
 * @param session The init session.
 * @param session.gitRoot The repository root.
 * @param project The project init picked.
 */
function checkSetUpHere({ gitRoot }: Session, project: Project) {
  const place = (folder: string) =>
    folder === gitRoot ? 'the repository root' : relativeOrDot(gitRoot, folder);
  const name = place(project.directory);
  const label = FRAMEWORK_NAMES[project.framework];
  // --framework storybook can name a folder with no Storybook, such as a Playwright package.
  if (project.framework === 'storybook' && !hasStorybook(project.directory)) {
    const above = runsAbove(project.directory, gitRoot, 'storybook');
    if (above) throw ranAbove(above, gitRoot, name);
    clack.log.error(`No Storybook found in ${name}.`);
    clack.log.info(
      `Set up Storybook first with ${color.cta('npm create storybook@latest')}, then run this again.`
    );
    throw new SubcommandFailure('No Storybook', { exitCode: 1 });
  }
  if (project.framework !== 'storybook') {
    const config = findTestConfig(project.framework, project.directory, gitRoot);
    if (!config) {
      clack.log.error(`No ${label} config found in ${name} or above.`);
      const guide = color.cta(SETUP_DOCS[project.framework]);
      clack.log.info(`Set up ${label} with Chromatic first (${guide}), then run this again.`);
      throw new SubcommandFailure(`No ${label} config`, { exitCode: 1 });
    }
    const folder = path.dirname(config);
    const file = path.basename(config);
    if (folder !== project.directory) {
      const { framework } = project;
      throw ranAbove({ folder, framework, file, what: `${label} runs` }, gitRoot, name);
    }
  }
  if (existsSync(path.join(project.directory, 'package.json'))) return;
  clack.log.error(
    `${name} has no package.json, so init has nowhere to add chromatic and a "chromatic" script.`
  );
  const nearest = foldersUp(project.directory, gitRoot)
    .slice(1)
    .find((folder) => existsSync(path.join(folder, 'package.json')));
  const move = nearest
    ? `, or move the ${label} config to ${place(nearest)}, the nearest package, and update the paths in it`
    : '';
  clack.log.info(`Add a package.json to ${name}${move}, then run this again.`);
  throw new SubcommandFailure(`No package.json in ${name}`, { exitCode: 1 });
}

/**
 * Picks the project to set up: the only one, the one init ran in, or the user's choice.
 *
 * @param session The init session.
 * @param projects Every project detection found.
 *
 * @returns The project.
 */
export async function pickProject(session: Session, projects: Project[]): Promise<Project> {
  const { flags, interactive } = session;
  // As in doctor, --project names a folder; a file such as README.md isn't a project.
  if (flags.project && !isDirectory(path.resolve(process.cwd(), flags.project))) {
    throw new SubcommandFailure(`No directory at ${flags.project}`, { exitCode: 1 });
  }
  pointAbove(session, projects);
  const candidates = matchFlags(session, projects);
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
  // Checked before the "Found" line, which a --framework override would otherwise contradict.
  const ready = (p: Project) => {
    checkSetUpHere(session, p);
    return p;
  };
  if (candidates.length === 1) {
    ready(candidates[0]);
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
      return ready(here);
    }
    clack.log.error(
      `Found ${candidates.length} ${kind}:\n${candidates.map((p) => label(p)).join('\n')}`
    );
    clack.log.info(`Pick one with ${color.cta('--project <dir>')}, or run init from inside it.`);
    throw new SubcommandFailure('More than one project to set up', { exitCode: 1 });
  }
  return ready(
    answered(
      await clack.select({
        message: `Found ${candidates.length} ${kind}. Which one should this Chromatic project test?`,
        initialValue: here ?? candidates[0],
        // Description in the label, not a hint: Clack shows hints only on the highlighted option.
        options: candidates.map((p) => ({ value: p, label: label(p) })),
      })
    )
  );
}

/**
 * The values init writes to the project's config file.
 *
 * @param project The project init sets up.
 * @param gitRoot The repository root.
 * @param parsed The config file as it is, if it parses.
 *
 * @returns The E2E framework flag, and for a project in a package, storybookBaseDir: the package,
 * or for Vitest the folder Vitest runs from. It points TurboSnap at the package even when CI runs
 * Chromatic from the root, and is harmless when CI runs it from the package. A storybookBaseDir the config already has is the user's.
 */
export function configValues(
  project: Project,
  gitRoot: string,
  parsed?: Record<string, any>
): Record<string, any> {
  const values: Record<string, any> =
    project.framework === 'storybook' ? {} : { [project.framework]: true };
  // Vitest names files from the folder it runs in, which TurboSnap has to match.
  const vitestConfig =
    project.framework === 'vitest'
      ? findTestConfig('vitest', project.directory, gitRoot)
      : undefined;
  const base = vitestConfig ? relativeOrDot(gitRoot, path.dirname(vitestConfig)) : project.relative;
  if (base !== '.' && parsed?.storybookBaseDir === undefined) {
    values.storybookBaseDir = base;
  }
  return values;
}
