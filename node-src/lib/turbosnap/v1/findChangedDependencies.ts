import { DepGraph } from '@snyk/dep-graph';
import fs from 'fs';
import os from 'os';
import pLimit from 'p-limit';
import path from 'path';

import {
  checkoutFile,
  fileExistsAtReference,
  findFilesFromRepositoryRoot,
  getRepositoryRoot,
} from '../../../git/git';
import { Context, Stats } from '../../../types';
import { matchesFile, SUPPORTED_LOCK_FILES } from '../../utilities';
import { compareBaseline } from './compareBaseline';
import { getDependencies } from './getDependencies';
import { getStatsScope } from './getStatsScope';
import { getStatsProjectRoot } from './statsPaths';

const PACKAGE_JSON = 'package.json';

// Yields a list of dependency names which have changed since the baseline.
// E.g. ['react', 'react-dom', '@storybook/react']
// TODO: refactor this function
// eslint-disable-next-line complexity,max-statements
export const findChangedDependencies = async (ctx: Context, stats: Stats) => {
  const { packageMetadataChanges } = ctx.git;
  const { untraced = [] } = ctx.options;

  if (packageMetadataChanges?.length === 0) {
    ctx.log.debug('No package metadata changed found');
    return [];
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
    return [];
  }

  // The names of the dependencies that changed in each pair, compared to any baseline.
  const changesByManifest = new Map<string, Set<string>>();

  const packageConcurrency = ctx.env.CHROMATIC_TURBOSNAP_PACKAGE_CONCURRENCY;
  const headDependenciesLimit = pLimit(packageConcurrency);
  const baseDependenciesLimit = pLimit(packageConcurrency);

  await Promise.all(
    filteredPathPairs.map(([manifestPath, lockfilePath, commits]) =>
      headDependenciesLimit(async () => {
        const headDependencies = await getDependencies(ctx, {
          rootPath,
          manifestPath,
          lockfilePath,
        });

        ctx.log.debug({ manifestPath, lockfilePath }, `Found HEAD dependencies`);

        // Retrieve the union of dependencies which changed compared to each baseline.
        await Promise.all(
          commits.map((reference) =>
            baseDependenciesLimit(async () => {
              const baselineChanges = await getBaselineChanges(ctx, {
                reference,
                manifestPath,
                lockfilePath,
                headDependencies,
              });
              const changes = changesByManifest.get(manifestPath) ?? new Set();
              for (const change of baselineChanges) changes.add(change);
              changesByManifest.set(manifestPath, changes);
            })
          )
        );
      })
    )
  );

  return keepChangesInScope(ctx, {
    stats,
    rootPath,
    manifestPaths: [...new Set(metadataPathPairs.map(([manifestPath]) => manifestPath))],
    changesByManifest,
  });
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
 * @param options.reference The baseline commit.
 * @param options.manifestPath The repository-relative path of the `package.json`.
 * @param options.lockfilePath The repository-relative path of its lockfile.
 * @param options.headDependencies The pair's dependency graph at HEAD.
 *
 * @returns The names of the changed dependencies. Throws when the baseline lockfile, or a manifest
 * that exists at the baseline, can't be checked out, which makes the caller bail.
 */
async function getBaselineChanges(
  ctx: Context,
  {
    reference,
    manifestPath,
    lockfilePath,
    headDependencies,
  }: { reference: string; manifestPath: string; lockfilePath: string; headDependencies: DepGraph }
) {
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
      // The lockfile checked out, so the baseline commit is here. If git can't confirm the manifest
      // is there too, treat it as added: that over-reports changes rather than missing any.
      if (await fileExistsAtReference(ctx, reference, manifestPath)) throw manifestCheckout.reason;

      ctx.log.debug({ reference, manifestPath }, 'Manifest was added since the baseline');
      return new Set(headDependencies.getPkgs().map(({ name }) => name));
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
 * Lists the packages a manifest declares as its own dependencies. Peer dependencies are left out,
 * because the copy a peer resolves to belongs to whoever installs it.
 *
 * @param rootPath The absolute repository root.
 * @param manifestPath The repository-relative path of the `package.json`.
 *
 * @returns The package names, or none when the manifest can't be read.
 */
function readDeclaredDependencies(rootPath: string, manifestPath: string) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(rootPath, manifestPath), 'utf8'));
    return ['dependencies', 'devDependencies', 'optionalDependencies'].flatMap((field) =>
      Object.keys(manifest[field] ?? {})
    );
  } catch {
    return [];
  }
}
