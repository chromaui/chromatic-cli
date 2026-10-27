import { DepGraph } from '@snyk/dep-graph';
import fs from 'fs';
import os from 'os';
import pLimit from 'p-limit';
import path from 'path';

import { checkoutFile, findFilesFromRepositoryRoot, getRepositoryRoot } from '../../../git/git';
import { Context, Stats } from '../../../types';
import { matchesFile, SUPPORTED_LOCK_FILES } from '../../utilities';
import { BaselineChanges, compareBaseline, toPackageId } from './compareBaseline';
import { BaselineCheckoutFailedError } from './errors';
import { getDependencies } from './getDependencies';
import { getStatsScope } from './getStatsScope';
import { createVersionLookup } from './lockfileVersions';
import { getStatsProjectRoot } from './statsPaths';
import { getSkippablePackages, getUnchangedCopyCheck, IsUnchangedCopy } from './unchangedCopies';

const PACKAGE_JSON = 'package.json';

/** The dependencies that changed since the baselines. */
export interface ChangedDependencies {
  /** The names of the changed dependencies, such as `['react', '@storybook/react']`. */
  names: string[];
  /**
   * Tells whether an installed copy of a changed dependency is at a version that didn't change, so
   * the tracer can leave it out. False whenever that can't be told for sure.
   */
  isUnchangedCopy: IsUnchangedCopy;
}

export const noChanges = (): ChangedDependencies => ({ names: [], isUnchangedCopy: () => false });

// Finds the dependencies which have changed since the baseline, and which of their installed copies
// didn't change.
// TODO: refactor this function
// eslint-disable-next-line complexity,max-statements
export const findChangedDependencies = async (ctx: Context, stats: Stats) => {
  const { packageMetadataChanges } = ctx.git;
  const { untraced = [] } = ctx.options;

  if (packageMetadataChanges?.length === 0) {
    ctx.log.debug('No package metadata changed found');
    return noChanges();
  }

  ctx.log.debug(
    { packageMetadataChanges },
    `Finding changed dependencies for ${packageMetadataChanges?.length} baselines`
  );

  const rootPath = (await getRepositoryRoot(ctx)) || '';
  const [rootManifestPath] = (await findFilesFromRepositoryRoot(ctx, rootPath, PACKAGE_JSON)) || [];
  const [rootLockfilePath] =
    (await findFilesFromRepositoryRoot(ctx, rootPath, ...SUPPORTED_LOCK_FILES)) || [];
  if (!rootManifestPath || !rootLockfilePath) {
    ctx.log.debug(
      { rootPath, rootManifestPath, rootLockfilePath },
      'No manifest or lockfile found at the root of the repository'
    );
  }

  ctx.log.debug({ rootPath, rootManifestPath, rootLockfilePath }, `Found manifest and lockfile`);

  // Handle monorepos with (multiple) nested package.json files.
  // Note that this does not use `path.join` to concatenate the file paths because
  // git uses forward slashes, even on windows
  const nestedManifestPaths =
    (await findFilesFromRepositoryRoot(ctx, rootPath, `**/${PACKAGE_JSON}`)) || [];
  ctx.log.debug({ nestedManifestPaths: nestedManifestPaths.length }, 'Found nested manifest paths');

  const manifestConcurrency = ctx.env.CHROMATIC_TURBOSNAP_MANIFEST_CONCURRENCY;
  const manifestLimit = pLimit(manifestConcurrency);
  const metadataPathPairs = await Promise.all(
    nestedManifestPaths.map((manifestPath) =>
      manifestLimit(async () => {
        const dirname = path.dirname(manifestPath);
        const [lockfilePath] =
          (await findFilesFromRepositoryRoot(
            ctx,
            rootPath,
            ...SUPPORTED_LOCK_FILES.map((lockfile) => `${dirname}/${lockfile}`)
          )) || [];
        // Fall back to the root lockfile if we can't find one in the same directory.
        return [manifestPath, lockfilePath || rootLockfilePath];
      })
    )
  );

  if (rootManifestPath && rootLockfilePath) {
    metadataPathPairs.unshift([rootManifestPath, rootLockfilePath]);
  } else if (metadataPathPairs.length === 0) {
    throw new Error(
      `Could not find any pairs of ${PACKAGE_JSON} + ${SUPPORTED_LOCK_FILES.join(' / ')}`
    );
  }

  ctx.log.debug(
    { pathPairs: metadataPathPairs },
    `Found ${metadataPathPairs.length} manifest/lockfile pairs to check`
  );

  // Now filter out any pairs that don't have git changes, or for which the manifest is untraced
  const filteredPathPairs = metadataPathPairs
    .map(([manifestPath, lockfilePath]) => {
      const commits = packageMetadataChanges
        ?.filter(({ changedFiles }) =>
          changedFiles.some((file) => file === lockfilePath || file === manifestPath)
        )
        .map(({ commit }) => commit);

      return [manifestPath, lockfilePath, [...new Set(commits)]] as const;
    })
    .filter(
      ([manifestPath, , commits]) =>
        !untraced.some((glob) => matchesFile(glob, manifestPath)) && commits.length > 0
    );

  ctx.log.debug(
    { filteredPathPairs },
    `Found ${filteredPathPairs.length} manifest/lockfile pairs to diff`
  );

  // Short circuit
  if (filteredPathPairs.length === 0) {
    return noChanges();
  }

  const packageConcurrency = ctx.env.CHROMATIC_TURBOSNAP_PACKAGE_CONCURRENCY;
  const headDependenciesLimit = pLimit(packageConcurrency);
  const baseDependenciesLimit = pLimit(packageConcurrency);

  // Each pair's packages at HEAD, and what changed in it compared to each baseline.
  const pairs = await Promise.all(
    filteredPathPairs.map(([manifestPath, lockfilePath, commits]) =>
      headDependenciesLimit(async () => {
        const headDependencies = await getDependencies(ctx, {
          rootPath,
          manifestPath,
          lockfilePath,
        });

        ctx.log.debug({ manifestPath, lockfilePath }, `Found HEAD dependencies`);

        const changes = await Promise.all(
          commits.map((reference) =>
            baseDependenciesLimit(() =>
              getBaselineChanges(ctx, {
                rootPath,
                reference,
                manifestPath,
                lockfilePath,
                headDependencies,
              })
            )
          )
        );
        return { manifestPath, headPackages: headDependencies.getDepPkgs(), changes };
      })
    )
  );

  // The names of the dependencies that changed in each pair, compared to any baseline.
  const changesByManifest = new Map<string, Set<string>>();
  for (const { manifestPath, changes } of pairs) {
    const names = changesByManifest.get(manifestPath) ?? new Set();
    for (const change of changes) for (const name of change.names) names.add(name);
    changesByManifest.set(manifestPath, names);
  }

  // Every pair's HEAD packages and versioned changes count, even for names the scope then drops.
  // The extra changes can only make fewer copies skippable. The extra HEAD packages can make more
  // copies skippable, such as a hoisted copy only an out-of-scope workspace declares. That's still
  // safe: each version passed its own pair's diff against the baseline, and a hoisted copy that
  // was swapped out shows its old version as removed.
  const skippablePackages = getSkippablePackages(
    pairs.flatMap(({ headPackages }) => headPackages),
    pairs.flatMap(({ changes }) => changes)
  );

  // A nested manifest has no lockfile when neither its directory nor the root has one.
  const versions = createVersionLookup(ctx, rootPath, [
    ...new Set(metadataPathPairs.flatMap(([, lockfilePath]) => lockfilePath || [])),
  ]);
  return {
    names: keepChangesInScope(ctx, {
      stats,
      rootPath,
      manifestPaths: [...new Set(metadataPathPairs.map(([manifestPath]) => manifestPath))],
      changesByManifest,
    }),
    isUnchangedCopy: getUnchangedCopyCheck(versions, skippablePackages),
  };
};

/**
 * Keeps the dependency changes that can reach the Storybook. A workspace the Storybook loads
 * reports every change. Another workspace's change to a package can't reach the Storybook when a
 * loaded workspace declares that package and so does every loaded workspace whose own files import
 * it: their own pairs report any change to their copies. Otherwise the Storybook may import a
 * hoisted copy, so the change stays. This trusts that a declaring workspace's files get its own
 * copy; a bundler `resolve.alias` or Vite `resolve.dedupe` that points them at another copy isn't
 * visible in the stats.
 *
 * @param ctx The context set when executing the CLI.
 * @param options The changes and what to scope them with.
 * @param options.stats The parsed stats file of the Storybook build.
 * @param options.rootPath The absolute repository root.
 * @param options.manifestPaths Repository-relative paths of every `package.json` in the repository.
 * @param options.changesByManifest The names of the changed dependencies of each changed pair.
 *
 * @returns The distinct names of the changes to keep.
 */
function keepChangesInScope(
  ctx: Context,
  {
    stats,
    rootPath,
    manifestPaths,
    changesByManifest,
  }: {
    stats: Stats;
    rootPath: string;
    manifestPaths: string[];
    changesByManifest: Map<string, Set<string>>;
  }
) {
  const { untraced = [] } = ctx.options;
  const scope = getStatsScope(stats, {
    rootPath,
    projectRoot: getStatsProjectRoot(ctx),
    manifestPaths,
  });
  // An untraced manifest's own changes aren't reported, so its declarations cover nothing.
  const declaredBy = new Map(
    [...scope.loadedManifestPaths]
      .filter((manifestPath) => !untraced.some((glob) => matchesFile(glob, manifestPath)))
      .map((manifestPath) => [
        manifestPath,
        new Set(readDeclaredDependencies(rootPath, manifestPath)),
      ])
  );
  const declaredInScope = new Set([...declaredBy.values()].flatMap((declared) => [...declared]));
  const isCovered = (name: string) =>
    declaredInScope.has(name) &&
    !scope.unattributedPackages.has(name) &&
    [...(scope.importersByPackage.get(name) ?? [])].every((importer) =>
      declaredBy.get(importer)?.has(name)
    );

  const allNames = new Set([...changesByManifest.values()].flatMap((names) => [...names]));
  const keptNames = new Set(
    [...changesByManifest].flatMap(([manifestPath, names]) =>
      [...names].filter((name) => scope.loadedManifestPaths.has(manifestPath) || !isCovered(name))
    )
  );
  ctx.log.debug(
    {
      scopedManifestPaths: [...scope.loadedManifestPaths],
      ignoredDependencyNames: [...allNames].filter((name) => !keptNames.has(name)),
    },
    'Ignoring changes by other workspaces to dependencies the Storybook declares'
  );
  return [...keptNames];
}

/**
 * Finds the dependencies of a manifest/lockfile pair that changed since a baseline. A change means
 * either the version number is different or the dependency was added or removed. A manifest added
 * since the baseline makes everything it installs, and the workspace itself, a change; the tracer
 * then decides which stories that reaches.
 *
 * @param ctx The context set when executing the CLI.
 * @param options The pair and the baseline to compare it with.
 * @param options.rootPath The absolute repository root.
 * @param options.reference The baseline commit.
 * @param options.manifestPath The repository-relative path of the `package.json`.
 * @param options.lockfilePath The repository-relative path of its lockfile.
 * @param options.headDependencies The pair's dependency graph at HEAD.
 *
 * @returns The changed dependencies. Throws when the baseline lockfile, or a manifest
 * that exists at the baseline, can't be checked out, which makes the caller bail.
 */
async function getBaselineChanges(
  ctx: Context,
  {
    rootPath,
    reference,
    manifestPath,
    lockfilePath,
    headDependencies,
  }: {
    rootPath: string;
    reference: string;
    manifestPath: string;
    lockfilePath: string;
    headDependencies: DepGraph;
  }
): Promise<BaselineChanges> {
  // Check the baseline pair out into a temporary directory that mirrors the repository layout, so
  // the manifest keeps its position relative to the lockfile.
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromatic'));
  try {
    const [manifestCheckout, lockfileCheckout] = await Promise.allSettled([
      checkoutFile(ctx, reference, manifestPath, tmpdir),
      checkoutFile(ctx, reference, lockfilePath, tmpdir),
    ]);
    if (lockfileCheckout.status === 'rejected') throw lockfileCheckout.reason;
    if (manifestCheckout.status === 'rejected') {
      // Only a manifest git confirms is missing counts as added. Any other failure bails.
      const { reason } = manifestCheckout;
      if (!(reason instanceof BaselineCheckoutFailedError && reason.fileMissing)) throw reason;

      ctx.log.debug({ reference, manifestPath }, 'Manifest was added since the baseline');
      // The graph's root stands for the workspace itself, but the parser names it `package.json`
      // when the manifest has no name, so take the name from the manifest instead.
      const { name } = readManifest(rootPath, manifestPath);
      const pkgs = headDependencies.getDepPkgs();
      return {
        names: new Set([
          ...(typeof name === 'string' && name ? [name] : []),
          ...pkgs.map((pkg) => pkg.name),
        ]),
        packages: new Set(pkgs.map((pkg) => toPackageId(pkg))),
        removedNames: new Set(),
      };
    }

    const baselineDependencies = await getDependencies(ctx, {
      rootPath: tmpdir,
      manifestPath,
      lockfilePath,
    });
    ctx.log.debug({ reference }, `Found baseline dependencies`);

    return await compareBaseline(headDependencies, baselineDependencies);
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
}

/**
 * Reads and parses a manifest.
 *
 * @param rootPath The absolute repository root.
 * @param manifestPath The repository-relative path of the `package.json`.
 *
 * @returns The parsed manifest, or an empty object when it can't be read.
 */
function readManifest(rootPath: string, manifestPath: string): Record<string, any> {
  try {
    return JSON.parse(fs.readFileSync(path.join(rootPath, manifestPath), 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Lists the packages a manifest declares as its own dependencies. Peer dependencies are left out,
 * because the copy a peer resolves to belongs to whoever installs it.
 *
 * @param rootPath The absolute repository root.
 * @param manifestPath The repository-relative path of the `package.json`.
 *
 * @returns The package names, or none when the manifest can't be read.
 */
function readDeclaredDependencies(rootPath: string, manifestPath: string) {
  const manifest = readManifest(rootPath, manifestPath);
  return ['dependencies', 'devDependencies', 'optionalDependencies'].flatMap((field) =>
    Object.keys(manifest[field] ?? {})
  );
}
