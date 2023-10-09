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
  const { baselineCommits } = ctx.git;
  const { untraced = [] } = ctx.options;

  if (!baselineCommits.length) {
    ctx.log.debug('No baseline commits found');
    return [];
  }

  ctx.log.debug(
    { baselineCommits },
    `Finding changed dependencies for ${baselineCommits.length} baselines`
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
  let pathPairs = await Promise.all(
    nestedManifestPaths.map(async (manifestPath: string) => {
      const dirname = path.dirname(manifestPath);
      // Fall back to the root lockfile if we can't find one in the same directory.
      const [lockfilePath = rootLockfilePath] = await findFiles(
        `${dirname}/${YARN_LOCK}`,
        `${dirname}/${PACKAGE_LOCK}`
      );
      return lockfilePath && [manifestPath, lockfilePath];
    })
  );

  // Deal with missing rootLockfilePath which may have been used as fallback.
  pathPairs = pathPairs.filter(Boolean);

  if (rootManifestPath && rootLockfilePath) {
    pathPairs.unshift([rootManifestPath, rootLockfilePath]);
  } else if (!pathPairs.length) {
    throw new Error(`Could not find any pairs of ${PACKAGE_JSON} + ${PACKAGE_LOCK} / ${YARN_LOCK}`);
  }

  ctx.log.debug({ pathPairs }, `Found ${pathPairs.length} manifest/lockfile pairs to check`);

  const tracedPairs = pathPairs.filter(([manifestPath, lockfilePath]) => {
    if (untraced.some((glob) => matchesFile(glob, manifestPath))) return false;
    if (untraced.some((glob) => matchesFile(glob, lockfilePath))) return false;
    return true;
  });
  const untracedCount = pathPairs.length - tracedPairs.length;
  if (untracedCount) {
    ctx.log.debug(`Skipping ${untracedCount} manifest/lockfile pairs due to --untraced`);
  }

  // Use a Set so we only keep distinct package names.
  const changedDependencyNames = new Set<string>();

  await Promise.all(
    tracedPairs.map(async ([manifestPath, lockfilePath]) => {
      const headDependencies = await getDependencies(ctx, { rootPath, manifestPath, lockfilePath });
      ctx.log.debug({ manifestPath, lockfilePath, headDependencies }, `Found HEAD dependencies`);

      // Retrieve the union of dependencies which changed compared to each baseline.
      // A change means either the version number is different or the dependency was added/removed.
      // If a manifest or lockfile is missing on the baseline, this throws and we'll end up bailing.
      await Promise.all(
        baselineCommits.map(async (ref) => {
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
