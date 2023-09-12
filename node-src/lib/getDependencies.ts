import { buildDepTreeFromFiles, PkgTree } from 'snyk-nodejs-lockfile-parser';
import { Context } from '../types';

jest.setTimeout(10000);

const flattenDependencyTree = (
  tree: PkgTree['dependencies'],
  results = new Set<string>()
): Set<string> =>
  Object.values(tree).reduce((acc, dep) => {
    acc.add(`${dep.name}@@${dep.version}`);
    return flattenDependencyTree(dep.dependencies || {}, acc);
  }, results);

export const getDependencies = async (
  ctx: Context,
  {
    rootPath,
    manifestPath,
    lockfilePath,
    includeDev = true,
  }: {
    rootPath: string;
    manifestPath: string;
    lockfilePath: string;
    includeDev?: boolean;
  }
) => {
  try {
    const headTree = await buildDepTreeFromFiles(rootPath, manifestPath, lockfilePath, includeDev);
    return flattenDependencyTree(headTree.dependencies);
  } catch (e) {
    ctx.log.debug({ rootPath, manifestPath, lockfilePath }, 'Failed to get dependencies');
    throw e;
  }
};
