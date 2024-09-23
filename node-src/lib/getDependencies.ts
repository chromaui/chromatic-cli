import { buildDepTreeFromFiles, PkgTree } from 'snyk-nodejs-lockfile-parser';

import { Context } from '../types';

export const getDependencies = async (
  ctx: Context,
  {
    rootPath,
    manifestPath,
    lockfilePath,
    includeDev = true,
    strictOutOfSync = false,
  }: {
    rootPath: string;
    manifestPath: string;
    lockfilePath: string;
    includeDev?: boolean;
    strictOutOfSync?: boolean;
  }
) => {
  try {
    const headTree = await buildDepTreeFromFiles(
      rootPath,
      manifestPath,
      lockfilePath,
      includeDev,
      strictOutOfSync
    );
    return flattenDependencyTree(headTree.dependencies);
  } catch (err) {
    ctx.log.debug({ rootPath, manifestPath, lockfilePath }, 'Failed to get dependencies');
    throw err;
  }
};

function flattenDependencyTree(tree: PkgTree['dependencies'], results = new Set<string>()) {
  for (const dep of Object.values(tree)) {
    results.add(`${dep.name}@@${dep.version}`);
    flattenDependencyTree(dep.dependencies || {}, results);
  }

  return results;
}
