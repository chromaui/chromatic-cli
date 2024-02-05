import path from 'path';

import { checkoutFile, findFiles, getRepositoryRoot } from '../git/git';
import { Context } from '../types';
import { compareBaseline } from './compareBaseline';
import { getDependencies } from './getDependencies';
import { matchesFile } from './utils';

const PACKAGE_JSON = 'package.json';
const PACKAGE_LOCK = 'package-lock.json';
const YARN_LOCK = 'yarn.lock';

// Yields a list of dependency names which have changed since the baseline.
// E.g. ['react', 'react-dom', '@storybook/react']
export const findChangedDependencies = async (ctx: Context) => {
  const { packageMetadataChanges } = ctx.git;
  const { untraced = [] } = ctx.options;

  if (!packageMetadataChanges.length) {
    ctx.log.debug('No package metadata changed found');
    return [];
  }

  ctx.log.debug(
    { packageMetadataChanges },
    `Finding changed dependencies for ${packageMetadataChanges.length} baselines`
  );

  const rootPath = await getRepositoryRoot();
  const [rootManifestPath] = await findFiles(PACKAGE_JSON);
  const [rootLockfilePath] = await findFiles(YARN_LOCK, PACKAGE_LOCK);
  if (!rootManifestPath || !rootLockfilePath) {
    ctx.log.debug(
      { rootPath, rootManifestPath, rootLockfilePath },
      'No manifest or lockfile found at the root of the repository'
    );
  }

  ctx.log.debug({ rootPath, rootManifestPath, rootLockfilePath }, `Found manifest and lockfile`);

  // Handle monorepos with (multiple) nested package.json files.
  const nestedManifestPaths = await findFiles(`**/${PACKAGE_JSON}`);
  const pathPairs = await Promise.all(
    nestedManifestPaths.map(async (manifestPath) => {
      const dirname = path.dirname(manifestPath);
      const [lockfilePath] = await findFiles(
        `${dirname}/${YARN_LOCK}`,
        `${dirname}/${PACKAGE_LOCK}`
      );
      // Fall back to the root lockfile if we can't find one in the same directory.
      return [manifestPath, lockfilePath || rootLockfilePath];
    })
  );

  if (rootManifestPath && rootLockfilePath) {
    pathPairs.unshift([rootManifestPath, rootLockfilePath]);
  } else if (!pathPairs.length) {
    throw new Error(`Could not find any pairs of ${PACKAGE_JSON} + ${PACKAGE_LOCK} / ${YARN_LOCK}`);
  }

  ctx.log.debug({ pathPairs }, `Found ${pathPairs.length} manifest/lockfile pairs to check`);

  // Now filter out any pairs that don't have git changes, or for which the manifest is untraced
  const filteredPathPairs = pathPairs
    .map(([manifestPath, lockfilePath]) => {
      const commits = packageMetadataChanges
        .filter(
          ({ changedFiles }) =>
            changedFiles.includes(manifestPath) || changedFiles.includes(lockfilePath)
        )
        .map(({ commit }) => commit);

      return [manifestPath, lockfilePath, commits] as const;
    })
    .filter(([, , commits]) => commits.length > 0)
    .filter(([manifestPath]) => !untraced.some((glob) => matchesFile(glob, manifestPath)));

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

  await Promise.all(
    filteredPathPairs.map(async ([manifestPath, lockfilePath, commits]) => {
      const headDependencies = await getDependencies(ctx, { rootPath, manifestPath, lockfilePath });
      ctx.log.debug({ manifestPath, lockfilePath, headDependencies }, `Found HEAD dependencies`);

      // Retrieve the union of dependencies which changed compared to each baseline.
      // A change means either the version number is different or the dependency was added/removed.
      // If a manifest or lockfile is missing on the baseline, this throws and we'll end up bailing.
      await Promise.all(
        commits.map(async (ref) => {
          const baselineChanges = await compareBaseline(ctx, headDependencies, {
            ref,
            rootPath,
            manifestPath: await checkoutFile(ctx, ref, manifestPath),
            lockfilePath: await checkoutFile(ctx, ref, lockfilePath),
          });
          baselineChanges.forEach((change) => changedDependencyNames.add(change));
        })
      );
    })
  );

  return Array.from(changedDependencyNames);
};
