import path from 'path';
import { buildDepTreeFromFiles, PkgTree } from 'snyk-nodejs-lockfile-parser';
import { hasYarn } from 'yarn-or-npm';
import { checkoutFile, findFiles, getRepositoryRoot } from '../git/git';

const flattenDependencyTree = (
  tree: PkgTree['dependencies'],
  results = new Set<string>()
): Set<string> =>
  Object.values(tree).reduce((acc, dep) => {
    acc.add(`${dep.name}@@${dep.version}`);
    return flattenDependencyTree(dep.dependencies || {}, acc);
  }, results);

// Retrieve a set of values which is in either set, but not both.
const xor = <T>(left: Set<T>, right: Set<T>) =>
  Array.from(right.values()).reduce((acc, value) => {
    if (acc.has(value)) acc.delete(value);
    else acc.add(value);
    return acc;
  }, new Set(left));

// Yields a list of dependency names which have changed since the baseline.
// E.g. ['react', 'react-dom', '@storybook/react']
export const findChangedDependencies = async (baselineCommits: string[]) => {
  const manifestName = 'package.json';
  const lockfileName = hasYarn() ? 'yarn.lock' : 'package-lock.json';

  const rootPath = await getRepositoryRoot();
  const [rootManifestPath] = await findFiles(manifestName);
  const [rootLockfilePath] = await findFiles(lockfileName);
  if (!rootManifestPath || !rootLockfilePath) {
    throw new Error(`Could not find ${manifestName} or ${lockfileName} in the repository`);
  }

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

  // Use a Set so we only keep distinct package names.
  const changedDependencyNames = new Set<string>();

  await Promise.all(
    [[rootManifestPath, rootLockfilePath], ...pathPairs].map(
      async ([manifestPath, lockfilePath]) => {
        const headTree = await buildDepTreeFromFiles(rootPath, manifestPath, lockfilePath, true);
        const headDependencies = flattenDependencyTree(headTree.dependencies);

        // Retrieve the union of dependencies which changed compared to each baseline.
        // A change means either the version number is different or the dependency was added/removed.
        // If a manifest or lockfile is missing on the baseline, this throws and we'll end up bailing.
        await Promise.all(
          baselineCommits.map(async (commit) => {
            const manifest = await checkoutFile(commit, manifestPath);
            const lockfile = await checkoutFile(commit, lockfilePath);
            const baselineTree = await buildDepTreeFromFiles(rootPath, manifest, lockfile, true);
            const baselineDependencies = flattenDependencyTree(baselineTree.dependencies);
            // eslint-disable-next-line no-restricted-syntax
            for (const dependency of xor(baselineDependencies, headDependencies)) {
              // Strip the version number so we get a set of package names.
              changedDependencyNames.add(dependency.split('@@')[0]);
            }
          })
        );
      }
    )
  );

  return Array.from(changedDependencyNames);
};
