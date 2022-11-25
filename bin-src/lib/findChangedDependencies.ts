import { buildDepTreeFromFiles, PkgTree } from 'snyk-nodejs-lockfile-parser';
import { hasYarn } from 'yarn-or-npm';
import { checkoutFile } from '../git/git';

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

  const headTree = await buildDepTreeFromFiles('.', manifestName, lockfileName, true);
  const headDependencies = flattenDependencyTree(headTree.dependencies);

  // Retrieve the union of dependencies which changed compared to each baseline.
  // A change means either the version number is different or the dependency was added/removed.
  const baselineDependencyChanges = await Promise.all(
    baselineCommits.map(async (commit) => {
      const manifestPath = await checkoutFile(commit, manifestName);
      const lockfilePath = await checkoutFile(commit, lockfileName);
      const baselineTree = await buildDepTreeFromFiles('.', manifestPath, lockfilePath, true);
      const baselineDependencies = flattenDependencyTree(baselineTree.dependencies);
      return Array.from(xor(baselineDependencies, headDependencies));
    })
  ).then((res) => res.flat());

  // Strip the version number, then dedupe to get the distinct package names which need tracing.
  return Array.from(new Set(baselineDependencyChanges.map((pkg) => pkg.split('@@')[0])));
};
