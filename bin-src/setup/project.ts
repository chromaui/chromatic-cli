import { existsSync } from 'node:fs';
import path from 'node:path';

import * as clack from '@clack/prompts';

import { SubcommandFailure } from '../subcommandFailure';
import { describeProject, findTestConfig, Framework, Project, runsAbove } from './detect';
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
  if (!wanted || !existsSync(wanted)) return [];
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
  if (!wanted || !existsSync(wanted) || projects.some((p) => p.directory === wanted)) return;
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
