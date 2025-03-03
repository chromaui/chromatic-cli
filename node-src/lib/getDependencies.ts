import { statSync } from 'fs';
import path from 'path';
import { inspect } from 'snyk-nodejs-plugin';

import { Context } from '../types';

export const MAX_LOCK_FILE_SIZE = 10_485_760; // 10 MB

export interface BaselineConfig {
  rootPath: string;
  manifestPath: string;
  lockfilePath: string;
}

export const getDependencies = async (
  ctx: Context,
  {
    rootPath,
    manifestPath,
    lockfilePath,
  }: {
    rootPath: string;
    manifestPath: string;
    lockfilePath: string;
  }
) => {
  const absoluteLockfilePath = path.resolve(rootPath, lockfilePath);
  const absoluteManifestPath = path.resolve(rootPath, manifestPath);

  // We can run into OOM errors if the lock file is too large. Therefore, we bail early and skip
  // lock file parsing because some TurboSnap is better than no TurboSnap.
  ensureLockFileSize(ctx, absoluteLockfilePath);

  try {
    const headGraph = await inspect(path.dirname(absoluteManifestPath), absoluteLockfilePath, {
      dev: true, // Include dev dependencies
      strictOutOfSync: false, // Don't throw an error if the lock file is out of sync
    });

    if (headGraph.scannedProjects.length !== 1 || !headGraph.scannedProjects[0].depGraph) {
      throw new Error('Failed to parse dependency graph');
    }

    return headGraph.scannedProjects[0].depGraph;
  } catch (err) {
    ctx.log.debug({ rootPath, manifestPath, lockfilePath }, 'Failed to get dependencies');
    throw err;
  }
};

function ensureLockFileSize(ctx: Context, fullPath: string) {
  const maxLockFileSize =
    Number.parseInt(process.env.MAX_LOCK_FILE_SIZE ?? '') || MAX_LOCK_FILE_SIZE;

  const stats = statSync(fullPath);
  if (stats.size > maxLockFileSize) {
    ctx.log.warn({ fullPath }, 'Lock file too large to parse, skipping');
    throw new Error('Lock file too large to parse');
  }
}
