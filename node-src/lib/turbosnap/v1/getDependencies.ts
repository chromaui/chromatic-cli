import { readFileSync, statSync } from 'fs';
import path from 'path';
import {
  getPnpmLockfileParser,
  parsePnpmProject,
  parsePnpmWorkspaceProject,
} from 'snyk-nodejs-lockfile-parser';
import { inspect } from 'snyk-nodejs-plugin';

import { Context } from '../../../types';
import { PNPM_LOCK_FILE } from '../../utilities';
import { LockFileParseFailedError, LockFileSizeExceededError } from './errors';

export const MAX_LOCK_FILE_SIZE = 10_485_760; // 10 MB

// The same options `snyk-nodejs-plugin` uses when it drives the pnpm parser for us.
const PNPM_PARSE_OPTIONS = {
  includeDevDeps: true,
  includeOptionalDeps: true,
  includePeerDeps: true,
  pruneWithinTopLevelDeps: true,
  strictOutOfSync: false,
};

export interface BaselineConfig {
  rootPath: string;
  manifestPath: string;
  lockfilePath: string;
}

/**
 * The pnpm lockfile keys each workspace package by its directory relative to the lockfile, which
 * pnpm calls the importer.
 *
 * @param manifestPath The path to a `package.json`.
 * @param lockfilePath The path to the lockfile it is installed from.
 *
 * @returns The importer key for the manifest, `.` when they share a directory.
 */
export const getImporter = (manifestPath: string, lockfilePath: string) =>
  path.posix.relative(path.posix.dirname(lockfilePath), path.posix.dirname(manifestPath)) || '.';

export const getDependencies = async (
  ctx: Context,
  {
    rootPath,
    manifestPath,
    lockfilePath,
    importer = '.',
  }: {
    rootPath: string;
    manifestPath: string;
    lockfilePath: string;
    /**
     * See `getImporter`. Needed when the files were copied away from their original directories.
     * Only used for pnpm lockfiles.
     */
    importer?: string;
  }
) => {
  const absoluteLockfilePath = path.resolve(rootPath, lockfilePath);
  const absoluteManifestPath = path.resolve(rootPath, manifestPath);

  // We can run into OOM errors if the lock file is too large. Therefore, we bail early and skip
  // lock file parsing because some TurboSnap is better than no TurboSnap.
  ensureLockFileSize(ctx, absoluteLockfilePath);

  try {
    return path.basename(absoluteLockfilePath) === PNPM_LOCK_FILE
      ? await parsePnpmLockfile(absoluteManifestPath, absoluteLockfilePath, importer)
      : await inspectLockfile(absoluteManifestPath, absoluteLockfilePath);
  } catch (err) {
    ctx.log.debug({ rootPath, manifestPath, lockfilePath }, 'Failed to get dependencies');
    throw err;
  }
};

// `snyk-nodejs-plugin` always resolves a pnpm manifest against the root importer, which leaves
// `catalog:` and `workspace:` specifiers of nested packages unresolved. Drive the parser directly
// so each manifest is resolved against its own importer table.
async function parsePnpmLockfile(
  absoluteManifestPath: string,
  absoluteLockfilePath: string,
  importer: string
) {
  try {
    const manifest = readFileSync(absoluteManifestPath, 'utf8');
    const lockfile = readFileSync(absoluteLockfilePath, 'utf8');

    // The workspace parser throws when the importer has no entry: standalone lockfiles before v9
    // have no importers table, and a `package.json` outside the workspace globs is never
    // installed. The yarn and npm parsers keep raw specifiers for manifests the lockfile can't
    // place rather than failing, so fall back to the parser that does the same for pnpm.
    // This parses the YAML a second time (the parsers below parse it again internally). Cheap
    // enough at our 10 MB cap, and simpler than catching the parser's failure and retrying.
    const isWorkspaceMember = Object.hasOwn(getPnpmLockfileParser(lockfile).importers, importer);
    return isWorkspaceMember
      ? await parsePnpmWorkspaceProject(manifest, lockfile, PNPM_PARSE_OPTIONS, importer)
      : await parsePnpmProject(manifest, lockfile, PNPM_PARSE_OPTIONS);
  } catch (error) {
    throw new LockFileParseFailedError(absoluteLockfilePath, { cause: error });
  }
}

async function inspectLockfile(absoluteManifestPath: string, absoluteLockfilePath: string) {
  let result: Awaited<ReturnType<typeof inspect>>;
  try {
    result = await inspect(path.dirname(absoluteManifestPath), absoluteLockfilePath, {
      dev: true, // Include dev dependencies
      strictOutOfSync: false, // Don't throw an error if the lock file is out of sync
    });
  } catch (error) {
    throw new LockFileParseFailedError(absoluteLockfilePath, { cause: error });
  }

  if (result.scannedProjects.length !== 1 || !result.scannedProjects[0].depGraph) {
    throw new LockFileParseFailedError(absoluteLockfilePath);
  }

  return result.scannedProjects[0].depGraph;
}

function ensureLockFileSize(ctx: Context, fullPath: string) {
  const maxLockFileSize =
    Number.parseInt(process.env.MAX_LOCK_FILE_SIZE ?? '') || MAX_LOCK_FILE_SIZE;

  const stats = statSync(fullPath);
  if (stats.size > maxLockFileSize) {
    ctx.log.warn({ fullPath }, 'Lock file too large to parse, skipping');
    throw new LockFileSizeExceededError(fullPath, stats.size);
  }
}
