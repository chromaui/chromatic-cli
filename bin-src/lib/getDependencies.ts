import { buildDepTreeFromFiles, PkgTree } from 'snyk-nodejs-lockfile-parser';

const flattenDependencyTree = (
  tree: PkgTree['dependencies'],
  results = new Set<string>()
): Set<string> =>
  Object.values(tree).reduce((acc, dep) => {
    acc.add(`${dep.name}@@${dep.version}`);
    return flattenDependencyTree(dep.dependencies || {}, acc);
  }, results);

export const getDependencies = async ({
  rootPath,
  manifestPath,
  lockfilePath,
}: {
  rootPath: string;
  manifestPath: string;
  lockfilePath: string;
}) => {
  const headTree = await buildDepTreeFromFiles(rootPath, manifestPath, lockfilePath, true);
  return flattenDependencyTree(headTree.dependencies);
};
