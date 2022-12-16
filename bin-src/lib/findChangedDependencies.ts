import path from 'path';
import { hasYarn } from 'yarn-or-npm';
import { checkoutFile, findFiles, getRepositoryRoot } from '../git/git';
import { Context } from '../types';
import { getDependencies } from './getDependencies';

// Retrieve a set of values which is in either set, but not both.
const xor = <T>(left: Set<T>, right: Set<T>) =>
  Array.from(right.values()).reduce((acc, value) => {
    if (acc.has(value)) acc.delete(value);
    else acc.add(value);
    return acc;
  }, new Set(left));

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
        baselineCommits.map(async (commit) => {
          const manifest = await checkoutFile(ctx, commit, manifestPath);
          const lockfile = await checkoutFile(ctx, commit, lockfilePath);
          const baselineDependencies = await getDependencies({
            rootPath,
            manifestPath: manifest,
            lockfilePath: lockfile,
          });
          ctx.log.debug(
            { commit, manifest, lockfile, baselineDependencies },
            `Found baseline dependencies`
          );
          // eslint-disable-next-line no-restricted-syntax
          for (const dependency of xor(baselineDependencies, headDependencies)) {
            // Strip the version number so we get a set of package names.
            changedDependencyNames.add(dependency.split('@@')[0]);
          }
        })
      );
    })
  );

  return Array.from(changedDependencyNames);
};
