import { copyFileSync, mkdtempSync, readFileSync, rmSync, statSync } from 'fs';
import os from 'os';
import path from 'path';
import {
  getPnpmLockfileParser,
  parsePnpmProject,
  parsePnpmWorkspaceProject,
} from 'snyk-nodejs-lockfile-parser';
import { inspect } from 'snyk-nodejs-plugin';

import { Context } from '../../../types';
import { posix } from '../../posix';
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

/**
 * Build the dependency graph for a manifest and the lockfile it is installed from.
 *
 * @param ctx The context set when executing the CLI.
 * @param options Where to find the files.
 * @param options.rootPath The directory the other paths are relative to.
 * @param options.manifestPath The repository-relative path to a `package.json`.
 * @param options.lockfilePath The repository-relative path to the lockfile it is installed from.
 *
 * @returns The dependency graph.
 */
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
    return path.basename(absoluteLockfilePath) === PNPM_LOCK_FILE
      ? await parsePnpmLockfile(absoluteManifestPath, absoluteLockfilePath)
      : await inspectLockfile(absoluteManifestPath, absoluteLockfilePath);
  } catch (err) {
    ctx.log.debug({ rootPath, manifestPath, lockfilePath }, 'Failed to get dependencies');
    throw err;
  }
};

// `snyk-nodejs-plugin` always resolves a pnpm manifest against the root importer, which leaves
// `catalog:` and `workspace:` specifiers of nested packages unresolved. Drive the parser directly
// so each manifest is resolved against its own importer table.
async function parsePnpmLockfile(absoluteManifestPath: string, absoluteLockfilePath: string) {
  const importer = getImporter(absoluteManifestPath, absoluteLockfilePath);
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

// The pnpm lockfile keys each workspace package by its directory relative to the lockfile, which
// pnpm calls the importer. `.` when they share a directory. The key always uses forward slashes,
// on every OS, so convert the OS-native relative path into the lockfile's key format.
const getImporter = (manifestPath: string, lockfilePath: string) =>
  posix(path.relative(path.dirname(lockfilePath), path.dirname(manifestPath))) || '.';

async function inspectLockfile(absoluteManifestPath: string, absoluteLockfilePath: string) {
  const tmpdir = mkdtempSync(path.join(os.tmpdir(), 'chromatic'));
  let result: Awaited<ReturnType<typeof inspect>>;
  try {
    // `inspect` ignores the manifest path it is given and reads the `package.json` next to the
    // lockfile, so copy the pair into a directory of their own before handing them over.
    const temporaryLockfilePath = path.join(tmpdir, path.basename(absoluteLockfilePath));
    copyFileSync(absoluteManifestPath, path.join(tmpdir, path.basename(absoluteManifestPath)));
    copyFileSync(absoluteLockfilePath, temporaryLockfilePath);

    result = await inspect(tmpdir, temporaryLockfilePath, {
      dev: true, // Include dev dependencies
      strictOutOfSync: false, // Don't throw an error if the lock file is out of sync
    });
  } catch (error) {
    throw new LockFileParseFailedError(absoluteLockfilePath, { cause: error });
  } finally {
    rmSync(tmpdir, { recursive: true, force: true });
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
