import fs from 'fs';
import os from 'os';
import pLimit from 'p-limit';
import path from 'path';

import { checkoutFile, findFilesFromRepositoryRoot, getRepositoryRoot } from '../../../git/git';
import { Context } from '../../../types';
import { matchesFile, SUPPORTED_LOCK_FILES } from '../../utilities';
import { compareBaseline } from './compareBaseline';
import { LockFileMissingError } from './errors';
import { getDependencies } from './getDependencies';

const PACKAGE_JSON = 'package.json';

// Yields a list of dependency names which have changed since the baseline.
// E.g. ['react', 'react-dom', '@storybook/react']
// TODO: refactor this function
// eslint-disable-next-line complexity,max-statements
export const findChangedDependencies = async (ctx: Context) => {
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

  // List every manifest and lockfile, at the root and in nested packages (monorepos), with one
  // call, since each call reads the whole git index. Paths use forward slashes, even on Windows.
  const metadataFiles =
    (await findFilesFromRepositoryRoot(
      ctx,
      rootPath,
      ...[PACKAGE_JSON, ...SUPPORTED_LOCK_FILES].flatMap((file) => [file, `**/${file}`])
    )) || [];
  let rootManifestPath: string | undefined;
  const nestedManifestPaths: string[] = [];
  const lockfilesByDirectory = new Map<string, string>();
  for (const file of metadataFiles) {
    const dirname = path.posix.dirname(file);
    if (file === PACKAGE_JSON) {
      rootManifestPath = file;
    } else if (path.posix.basename(file) === PACKAGE_JSON) {
      nestedManifestPaths.push(file);
    } else if (!lockfilesByDirectory.has(dirname)) {
      // `git ls-files` prints paths in index order, so this prefers package-lock.json, then
      // pnpm-lock.yaml, then yarn.lock, as a lookup of one directory's lockfiles would.
      lockfilesByDirectory.set(dirname, file);
    }
  }

  const rootLockfilePath = lockfilesByDirectory.get('.');
  if (!rootManifestPath || !rootLockfilePath) {
    ctx.log.debug(
      { rootPath, rootManifestPath, rootLockfilePath },
      'No manifest or lockfile found at the root of the repository'
    );
  }

  ctx.log.debug({ rootPath, rootManifestPath, rootLockfilePath }, `Found manifest and lockfile`);
  ctx.log.debug({ nestedManifestPaths: nestedManifestPaths.length }, 'Found nested manifest paths');

  const metadataPathPairs: [string, string | undefined][] = nestedManifestPaths.map(
    (manifestPath) => [
      manifestPath,
      // Fall back to the root lockfile if we can't find one in the same directory. With neither,
      // there is no lockfile, and we throw below if this manifest changed.
      lockfilesByDirectory.get(path.posix.dirname(manifestPath)) || rootLockfilePath,
    ]
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

  // Use a Set so we only keep distinct package names.
  const changedDependencyNames = new Set<string>();
  const tmpdirsCreated = new Set<string>();

  const packageConcurrency = ctx.env.CHROMATIC_TURBOSNAP_PACKAGE_CONCURRENCY;
  const headDependenciesLimit = pLimit(packageConcurrency);
  const baseDependenciesLimit = pLimit(packageConcurrency);

  try {
    await Promise.all(
      filteredPathPairs.map(([manifestPath, lockfilePath, commits]) =>
        headDependenciesLimit(async () => {
          if (!lockfilePath) throw new LockFileMissingError(manifestPath);

          const headDependencies = await getDependencies(ctx, {
            rootPath,
            manifestPath,
            lockfilePath,
          });

          ctx.log.debug({ manifestPath, lockfilePath }, `Found HEAD dependencies`);

          // Retrieve the union of dependencies which changed compared to each baseline.
          // A change means either the version number is different or the dependency was added/removed.
          // If a manifest or lockfile is missing on the baseline, this throws and we'll end up bailing.
          await Promise.all(
            commits.map((reference) =>
              baseDependenciesLimit(async () => {
                // Check the baseline pair out into a temporary directory that mirrors the
                // repository layout, so the manifest keeps its position relative to the lockfile.
                const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromatic'));
                tmpdirsCreated.add(tmpdir);
                await Promise.all([
                  checkoutFile(ctx, reference, manifestPath, tmpdir),
                  checkoutFile(ctx, reference, lockfilePath, tmpdir),
                ]);

                const baselineDependencies = await getDependencies(ctx, {
                  rootPath: tmpdir,
                  manifestPath,
                  lockfilePath,
                });

                ctx.log.debug({ reference }, `Found baseline dependencies`);

                const baselineChanges = await compareBaseline(
                  headDependencies,
                  baselineDependencies
                );
                for (const change of baselineChanges) {
                  changedDependencyNames.add(change);
                }
              })
            )
          );
        })
      )
    );
  } finally {
    for (const tmpdir of tmpdirsCreated) {
      fs.rmSync(tmpdir, { recursive: true, force: true });
    }
  }

  return [...changedDependencyNames];
};
