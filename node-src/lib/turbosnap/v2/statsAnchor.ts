import path from 'path';

import { Module, Stats, TurboSnapAnchorMismatchSubreason } from '../../../types';
import { isBuilderViteStats } from './builderViteCompatibility';
import { resolveStatsPath, stripConcatenatedModuleSuffix } from './paths';
import { ProjectFiles } from './projectFiles';

export interface AnchorMismatchReason {
  /** Why the pairing was refused; see {@link TurboSnapAnchorMismatchSubreason}. */
  subreason: TurboSnapAnchorMismatchSubreason;
  /** The evidence, reported to Sentry for whoever investigates the bail. */
  detail: string;
}

export interface SourceModuleResolution {
  /** How many distinctive source modules the stats name. */
  sourceModuleCount: number;
  /** The root those names resolve from, absent when none of them resolve at all. */
  statsRoot?: string;
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
 * @param input.projectFiles How to read the disk; see {@link ProjectFiles}.
 * @param resolution The stats-root resolution, computed once per build by the caller because the
 * manifest needs the same answer.
 *
 * @returns The structured anchor-mismatch reason, if any.
 */
export function getAnchorMismatchReason(
  stats: Stats,
  input: AnchorInput,
  resolution: SourceModuleResolution
): AnchorMismatchReason | undefined {
  return (
    getBuilderMismatch(stats, input.builderName) ??
    getStatsFileOutsideProject(input) ??
    getUnresolvedSourceModules(input.projectRoot, resolution)
  );
}

/** What the caller guarantees about the anchor; only the builder can genuinely be unknown. */
export interface AnchorInput {
  projectRoot: string;
  repositoryRoot: string;
  statsPath: string;
  configDir: string;
  /** Required rather than defaulted, so a caller cannot silently reach the real disk. */
  projectFiles: ProjectFiles;
  builderName?: string;
}

/**
 * Resolves the root relative stats paths are named from, and counts the source modules the verdict
 * rests on. The project root remains the default and wins whenever any source module resolves there;
 * the repository root is a fallback for builders that relativise names from the command's working
 * directory.
 *
 * This is a full pass over every name in the stats, so the caller runs it once and hands the result
 * to both the anchor check and the manifest.
 *
 * @param stats The preview stats file.
 * @param input The anchor the stats are resolved against.
 * @param input.projectRoot The absolute Storybook project root.
 * @param input.repositoryRoot The repository root, tried when names do not resolve from the project
 * root.
 * @param input.configDir The project-relative Storybook config directory.
 * @param input.projectFiles How to read the disk; see {@link ProjectFiles}.
 *
 * @returns The resolved stats root, if any, and the source module count.
 */
export function getSourceModuleResolution(
  stats: Stats,
  {
    projectRoot,
    repositoryRoot,
    configDir: configDirectory,
    projectFiles,
  }: Pick<AnchorInput, 'projectRoot' | 'repositoryRoot' | 'configDir' | 'projectFiles'>
): SourceModuleResolution {
  const sourceModules = statsPaths(stats).filter((name) => {
    if (name.includes('node_modules') || !SOURCE_MODULE_EXTENSIONS.test(name)) return false;
    return !isConfigDirectoryEntry(name, configDirectory);
  });

  for (const statsRoot of new Set([projectRoot, repositoryRoot])) {
    if (
      sourceModules.some((name) => {
        const absolutePath = resolveStatsPath(name, statsRoot);
        // A file, not merely something: a directory named like a source module is not a module the
        // anchor could have built, and reading one throws EISDIR.
        return isInside(projectRoot, absolutePath) && projectFiles.isFile(absolutePath);
      })
    ) {
      return { sourceModuleCount: sourceModules.length, statsRoot };
    }
  }

  return { sourceModuleCount: sourceModules.length };
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
  configDir: configDirectory,
  projectFiles,
}: AnchorInput): AnchorMismatchReason | undefined {
  const owningProject = findOwningProject(
    path.dirname(path.resolve(statsPath)),
    configDirectory,
    projectFiles
  );
  if (!owningProject || !isDisjoint(owningProject, projectRoot)) return undefined;

  return {
    subreason: 'statsFileOutsideProject',
    detail: `the stats file lives in the Storybook project ${owningProject}, which is not ${projectRoot}`,
  };
}

/**
 * Walks up from a directory to the nearest ancestor holding the Storybook config directory.
 */
function findOwningProject(
  directory: string,
  configDirectory: string,
  projectFiles: ProjectFiles
): string | undefined {
  let current = directory;
  for (;;) {
    if (projectFiles.isDirectory(path.join(current, configDirectory))) return current;
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
 * This is the gross-mismatch case — an unrelated anchor. A 2026-08-06 audit found that v2 did not, in
 * fact, survive it by accident: an anchor with one universal match (`.storybook/preview.ts`, present
 * at the same path in every project) produced a complete manifest with hashes read off the wrong
 * package, and `noStoryFiles` never fired. The evidence base now excludes config-directory entries —
 * they are not distinctive — and no longer discards absolute-spelled names before counting them as
 * missing, so a single boilerplate match or an all-absolute stats file can no longer pass for a
 * verdict.
 */
function getUnresolvedSourceModules(
  projectRoot: string,
  { sourceModuleCount, statsRoot }: SourceModuleResolution
): AnchorMismatchReason | undefined {
  if (sourceModuleCount === 0 || statsRoot) return undefined;

  return {
    subreason: 'unresolvedSourceModules',
    detail: `none of the ${sourceModuleCount} source modules in the stats exist under ${projectRoot}`,
  };
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

/**
 * Whether a stats-named module is the project's own config entrypoint (e.g. `.storybook/preview.ts`)
 * rather than project-identifying source. Every Storybook project has one at the same relative path,
 * so a lone match against it is not distinctive evidence for `getUnresolvedSourceModules` — the
 * predicate needs a real source or story file to confirm the anchor.
 */
function isConfigDirectoryEntry(name: string, configDirectory: string): boolean {
  const relativeName = name.replace(/^\.\//, '');
  return relativeName === configDirectory || relativeName.startsWith(`${configDirectory}/`);
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
