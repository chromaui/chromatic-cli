import { existsSync } from 'node:fs';
import path from 'node:path';

import * as clack from '@clack/prompts';

import { SubcommandFailure } from '../subcommandFailure';
import { describeProject, Framework, Project } from './detect';
import { answered, color, readJson, relativeOrDot } from './shared';
import type { Session } from './token';

/**
 * The projects --project and --framework allow. --framework picks among the setups found; with one
 * setup, or a --project folder detection missed, it overrides what detection decided.
 *
 * @param session The init session, for its flags and repository root.
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
 * The CI secret for a project's token. Each project in a monorepo is its own Chromatic project
 * with its own token, so each CI job needs its own secret, named after the project's whole path so
 * packages/ui and apps/ui differ. A single-project repository keeps the plain name.
 *
 * @param gitRoot Absolute repository root.
 * @param projects Every project detection found.
 * @param project The project being set up.
 *
 * @returns The secret's name.
 */
export function secretNameFor(gitRoot: string, projects: Project[], project: Project) {
  const monorepo =
    projects.length > 1 ||
    !!readJson(path.join(gitRoot, 'package.json'))?.workspaces ||
    existsSync(path.join(gitRoot, 'pnpm-workspace.yaml'));
  if (!monorepo || project.relative === '.') return 'CHROMATIC_PROJECT_TOKEN';
  const suffix = project.relative
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]+/g, '_')
    .replaceAll(/^_+|_+$/g, '');
  return `CHROMATIC_PROJECT_TOKEN_${suffix}`;
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
