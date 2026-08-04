import { existsSync } from 'fs';
import path from 'path';

import { Module, Stats, TurboSnapAnchorMismatchSubreason } from '../../../types';
import { isBuilderViteStats } from './builderViteCompatibility';
import { resolveStatsPath, stripConcatenatedModuleSuffix } from './paths';

export interface AnchorMismatchReason {
  /** Why the pairing was refused; see {@link TurboSnapAnchorMismatchSubreason}. */
  subreason: TurboSnapAnchorMismatchSubreason;
  /** The evidence, reported to Sentry for whoever investigates the bail. */
  detail: string;
}

const SOURCE_MODULE_EXTENSIONS = /\.(js|jsx|ts|tsx)$/;

/**
 * Returns why the stats file cannot be shown to belong to the project at `projectRoot`, or undefined
 * when nothing contradicts the pairing.
 *
 * Nothing else asks this question. Every other guard detects an *absence* — no config files, no
 * static files, no stories — and a wrong-but-structurally-similar anchor leaves nothing empty: paths
 * resolve, stories are found, and the manifest is complete with hashes read off another package's
 * files. So the check has to compare identities rather than count resolutions.
 *
 * @param stats The preview stats file.
 * @param input The anchor and the builder the project declares.
 * @param input.projectRoot The absolute Storybook project root the manifest anchors against.
 * @param input.repositoryRoot The repository root, tried when relative stats paths do not resolve
 * from the project root.
 * @param input.builderName The builder named by the project's own Storybook config, read from the
 * config directory rather than from the anchor, which is what makes it independent evidence.
 * @param input.statsPath The path the stats file was read from.
 * @param input.configDir The project-relative Storybook config directory.
 *
 * @returns The structured anchor-mismatch reason, if any.
 */
export function getAnchorMismatchReason(
  stats: Stats,
  { projectRoot, repositoryRoot, builderName, statsPath, configDir }: AnchorInput
): AnchorMismatchReason | undefined {
  return (
    getBuilderMismatch(stats, builderName) ??
    getStatsFileOutsideProject({ projectRoot, statsPath, configDir }) ??
    getUnresolvedSourceModules(stats, { projectRoot, repositoryRoot })
  );
}

export interface AnchorInput {
  projectRoot: string;
  repositoryRoot?: string;
  builderName?: string;
  statsPath?: string;
  configDir?: string;
}

/**
 * Returns the root relative stats paths are named from. The project root remains the default and
 * wins whenever any source module resolves there; the repository root is a fallback for builders
 * that relativise names from the command's working directory.
 */
export function getStatsRoot(
  stats: Stats,
  { projectRoot, repositoryRoot = projectRoot }: Pick<AnchorInput, 'projectRoot' | 'repositoryRoot'>
): string {
  return getSourceModuleResolution(stats, projectRoot, repositoryRoot).statsRoot ?? projectRoot;
}

/**
 * Compares the builder that produced the stats against the builder the project declares. Only Vite
 * is asserted in either direction: `isBuilderViteStats` identifies a stats contract with a proven
 * correctness defect, while webpack and rspack intentionally share the non-Vite bucket because both
 * satisfy the contract consumed here. Rspack's `rspackVersion` is a reliable signature, but without
 * a known contract defect it does not justify another bail. A framework whose name says nothing
 * about its builder (`@storybook/nextjs`) yields no verdict rather than a guess, so an unrecognised
 * project never bails here.
 */
function getBuilderMismatch(
  stats: Stats,
  builderName: string | undefined
): AnchorMismatchReason | undefined {
  const projectUsesVite = declaresVite(builderName);
  if (projectUsesVite === undefined) return undefined;

  const statsAreVite = isBuilderViteStats(stats);
  if (statsAreVite === projectUsesVite) return undefined;

  return {
    subreason: 'builderMismatch',
    detail: `stats were produced by ${statsAreVite ? 'Vite' : 'a non-Vite builder'}, but the project declares ${builderName}`,
  };
}

function declaresVite(builderName: string | undefined): boolean | undefined {
  if (!builderName) return undefined;
  if (builderName.includes('vite')) return true;
  if (/webpack|rsbuild|rspack/.test(builderName)) return false;
  return undefined;
}

/**
 * Asks which project the stats *file* lives in. This is the only witness that separates two siblings
 * built by the same builder, whose module names can be byte-identical: a prebuilt Storybook's stats
 * sit inside the project they describe.
 *
 * The owning project is the nearest ancestor of the stats file holding a config directory. Asking for
 * the config directory rather than a `package.json` is deliberate: the vite builder writes its own
 * `package.json` into `storybook-static`, so a package walk stops at the build output.
 *
 * A verdict needs the owning project to be disjoint from the anchor. An output directory *above* the
 * project (`dist/storybook` at a monorepo root) is a normal layout and says nothing, and a stats file
 * the CLI built into a temporary directory has no owning project at all.
 */
function getStatsFileOutsideProject({
  projectRoot,
  statsPath,
  configDir: configDirectory = '.storybook',
}: AnchorInput): AnchorMismatchReason | undefined {
  if (!statsPath) return undefined;

  const owningProject = findOwningProject(path.dirname(path.resolve(statsPath)), configDirectory);
  if (!owningProject || !isDisjoint(owningProject, projectRoot)) return undefined;

  return {
    subreason: 'statsFileOutsideProject',
    detail: `the stats file lives in the Storybook project ${owningProject}, which is not ${projectRoot}`,
  };
}

/**
 * Walks up from a directory to the nearest ancestor holding the Storybook config directory.
 */
function findOwningProject(directory: string, configDirectory: string): string | undefined {
  let current = directory;
  for (;;) {
    if (existsSync(path.join(current, configDirectory))) return current;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

/**
 * v1's `checkStorybookBaseDirectory` predicate, ported: at least one non-`node_modules` source module
 * from the stats must exist under either known spelling root. The project root is tried first; the
 * repository root covers builders that relativise stats names from the command's working directory.
 *
 * This is the gross-mismatch case — an unrelated anchor — which v2 already survives by accident,
 * since nothing resolves and `noStoryFiles` fires. Naming it keeps v1's diagnosis rather than
 * reporting a degenerate graph, and it costs nothing once the first module resolves.
 */
function getUnresolvedSourceModules(
  stats: Stats,
  { projectRoot, repositoryRoot = projectRoot }: Pick<AnchorInput, 'projectRoot' | 'repositoryRoot'>
): AnchorMismatchReason | undefined {
  const { sourceModuleCount, statsRoot } = getSourceModuleResolution(
    stats,
    projectRoot,
    repositoryRoot
  );

  if (sourceModuleCount === 0 || statsRoot) return undefined;

  return {
    subreason: 'unresolvedSourceModules',
    detail: `none of the ${sourceModuleCount} source modules in the stats exist under ${projectRoot}`,
  };
}

function getSourceModuleResolution(
  stats: Stats,
  projectRoot: string,
  repositoryRoot: string
): { sourceModuleCount: number; statsRoot?: string } {
  const sourceModules = statsPaths(stats).filter((name) => {
    if (name.includes('node_modules') || !SOURCE_MODULE_EXTENSIONS.test(name)) return false;
    return isInside(projectRoot, resolveStatsPath(name, projectRoot));
  });

  for (const statsRoot of new Set([projectRoot, repositoryRoot])) {
    if (
      sourceModules.some((name) => {
        const absolutePath = resolveStatsPath(name, statsRoot);
        return isInside(projectRoot, absolutePath) && existsSync(absolutePath);
      })
    ) {
      return { sourceModuleCount: sourceModules.length, statsRoot };
    }
  }

  return { sourceModuleCount: sourceModules.length };
}

/**
 * Every file name the stats mention: each module's own names plus the names of its importers.
 *
 * Deliberately not shared with `moduleFileNames` in manifest.ts, which enumerates the same stats to
 * build the graph and so returns each file once. This takes every spelling of every module,
 * including both `name` and `nameForCondition`, because the anchor checks only ask whether any one
 * name witnesses a mismatch — over-inclusion costs nothing and a missed spelling hides evidence.
 */
function statsPaths(stats: Stats): string[] {
  return stats.modules.flatMap((module: Module) =>
    [
      module.name,
      module.nameForCondition,
      ...(module.modules ?? []).flatMap((inner) => [inner.name, inner.nameForCondition]),
      ...(module.reasons ?? []).map((reason) => reason.moduleName),
    ]
      .filter(Boolean)
      .map((name) => stripConcatenatedModuleSuffix(name as string))
      .filter((name) => !name.includes('virtual:'))
  );
}

function isInside(directory: string, filePath: string): boolean {
  const relative = path.relative(directory, filePath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Whether two directories are unrelated: not the same, and neither contains the other.
 */
function isDisjoint(one: string, other: string): boolean {
  return (
    !isInside(one, other) && !isInside(other, one) && path.resolve(one) !== path.resolve(other)
  );
}
