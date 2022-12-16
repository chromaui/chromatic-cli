import path from 'path';
import { hasYarn } from 'yarn-or-npm';
import { checkoutFile, findFiles, getRepositoryRoot } from '../git/git';
import { Context } from '../types';
import { compareBaseline } from './compareBaseline';
import { getDependencies } from './getDependencies';

// Yields a list of dependency names which have changed since the baseline.
// E.g. ['react', 'react-dom', '@storybook/react']
export const findChangedDependencies = async (ctx: Context) => {
  const { baselineCommits } = ctx.git;
  const manifestName = 'package.json';
  const lockfileName = hasYarn() ? 'yarn.lock' : 'package-lock.json';

  if (!baselineCommits.length) {
    ctx.log.debug('No baseline commits found');
    return [];
  }

  ctx.log.debug(
    { baselineCommits },
    `Finding changed dependencies for ${baselineCommits.length} baselines`
  );

  const rootPath = await getRepositoryRoot();
  const [rootManifestPath] = await findFiles(manifestName);
  const [rootLockfilePath] = await findFiles(lockfileName);
  if (!rootManifestPath || !rootLockfilePath) {
    throw new Error(`Could not find ${manifestName} or ${lockfileName} in the repository`);
  }

  ctx.log.debug({ rootPath, rootManifestPath, rootLockfilePath }, `Found manifest and lockfile`);

  // Handle monorepos with multiple package.json files.
  const nestedManifestPaths = await findFiles(`**/${manifestName}`);
  const pathPairs = await Promise.all(
    nestedManifestPaths.map(async (manifestPath) => {
      const dirname = path.dirname(manifestPath);
      const [lockfilePath] = await findFiles(`${dirname}/${lockfileName}`);
      // Fall back to the root lockfile if we can't find one in the same directory.
      return [manifestPath, lockfilePath || rootLockfilePath];
    })
  );
  pathPairs.unshift([rootManifestPath, rootLockfilePath]);

  ctx.log.debug({ pathPairs }, `Found ${pathPairs.length} manifest/lockfile pairs to check`);

  // Use a Set so we only keep distinct package names.
  const changedDependencyNames = new Set<string>();

  await Promise.all(
    pathPairs.map(async ([manifestPath, lockfilePath]) => {
      const headDependencies = await getDependencies({ rootPath, manifestPath, lockfilePath });
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
