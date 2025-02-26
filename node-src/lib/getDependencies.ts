import { statSync } from 'fs';
import path from 'path';
import { PkgTree } from 'snyk-nodejs-lockfile-parser';
import { inspect } from 'snyk-nodejs-plugin';

import { Context } from '../types';

export const MAX_LOCK_FILE_SIZE = 10_485_760; // 10 MB

export const getDependencies = async (
  ctx: Context,
  {
    rootPath,
    manifestPath,
    lockfilePath,
    // eslint-disable-next-line unicorn/prevent-abbreviations
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
  // We can run into OOM errors if the lock file is too large. Therefore, we bail early and skip
  // lock file parsing because some TurboSnap is better than no TurboSnap.
  ensureLockFileSize(ctx, path.resolve(rootPath, lockfilePath));

  try {
    // rootPath/package.json
    // manifestPath
    const headGraph = await inspect(path.dirname(manifestPath), lockfilePath, {
      dev: includeDev,
      strictOutOfSync,
    });
    return headGraph.scannedProjects[0].depGraph;

    // try {
    // const headTree = await buildDepTreeFromFiles(
    //   rootPath,
    //   manifestPath, // package.json
    //   lockfilePath,
    //   includeDev,
    //   strictOutOfSync
    // );
    // return flattenDependencyTree(headTree.dependencies);
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

function ensureLockFileSize(ctx: Context, fullPath: string) {
  const maxLockFileSize =
    Number.parseInt(process.env.MAX_LOCK_FILE_SIZE ?? '') || MAX_LOCK_FILE_SIZE;

  const stats = statSync(fullPath);
  if (stats.size > maxLockFileSize) {
    ctx.log.warn({ fullPath }, 'Lock file too large to parse, skipping');
    throw new Error('Lock file too large to parse');
  }
}
