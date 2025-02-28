import fs from 'fs';
import os from 'os';
import path from 'path';

import { checkoutFile, findFilesFromRepositoryRoot, getRepositoryRoot } from '../git/git';
import { Context } from '../types';
import { compareBaseline } from './compareBaseline';
import { getDependencies } from './getDependencies';
import { matchesFile } from './utils';

const PACKAGE_JSON = 'package.json';
const SUPPORTED_LOCK_FILES = ['yarn.lock', 'pnpm-lock.yaml', 'package-lock.json'];

// Yields a list of dependency names which have changed since the baseline.
// E.g. ['react', 'react-dom', '@storybook/react']
// TODO: refactor this function
// eslint-disable-next-line complexity
export const findChangedDependencies = async (ctx: Context) => {
  const { packageMetadataChanges } = ctx.git;
  const { untraced = [] } = ctx.options;

  if (packageMetadataChanges?.length === 0) {
    ctx.log.debug('No package metadata changed found');
    return [];
  }

  ctx.log.debug(
    { packageMetadataChanges },
    `Finding changed dependencies for ${packageMetadataChanges?.length} baselines`
  );

  const rootPath = (await getRepositoryRoot()) || '';
  const [rootManifestPath] = (await findFilesFromRepositoryRoot(PACKAGE_JSON)) || [];
  const [rootLockfilePath] = (await findFilesFromRepositoryRoot(...SUPPORTED_LOCK_FILES)) || [];
  if (!rootManifestPath || !rootLockfilePath) {
    ctx.log.debug(
      { rootPath, rootManifestPath, rootLockfilePath },
      'No manifest or lockfile found at the root of the repository'
    );
  }

  ctx.log.debug({ rootPath, rootManifestPath, rootLockfilePath }, `Found manifest and lockfile`);

  // Handle monorepos with (multiple) nested package.json files.
  // Note that this does not use `path.join` to concatenate the file paths because
  // git uses forward slashes, even on windows
  const nestedManifestPaths = (await findFilesFromRepositoryRoot(`**/${PACKAGE_JSON}`)) || [];
  const metadataPathPairs = await Promise.all(
    nestedManifestPaths.map(async (manifestPath) => {
      const dirname = path.dirname(manifestPath);
      const [lockfilePath] =
        (await findFilesFromRepositoryRoot(
          ...SUPPORTED_LOCK_FILES.map((lockfile) => `${dirname}/${lockfile}`)
        )) || [];
      // Fall back to the root lockfile if we can't find one in the same directory.
      return [manifestPath, lockfilePath || rootLockfilePath];
    })
  );

  if (rootManifestPath && rootLockfilePath) {
    metadataPathPairs.unshift([rootManifestPath, rootLockfilePath]);
  } else if (metadataPathPairs.length === 0) {
    throw new Error(
      `Could not find any pairs of ${PACKAGE_JSON} + ${SUPPORTED_LOCK_FILES.join(' / ')}`
    );
  }

  ctx.log.debug(
    { pathPairs: metadataPathPairs },
    `Found ${metadataPathPairs.length} manifest/lockfile pairs to check`
  );

  // Now filter out any pairs that don't have git changes, or for which the manifest is untraced
  const filteredPathPairs = metadataPathPairs
    .map(([manifestPath, lockfilePath]) => {
      const commits = packageMetadataChanges
        ?.filter(({ changedFiles }) =>
          changedFiles.some((file) => file === lockfilePath || file === manifestPath)
        )
        .map(({ commit }) => commit);

      return [manifestPath, lockfilePath, [...new Set(commits)]] as const;
    })
    .filter(
      ([manifestPath, , commits]) =>
        !untraced.some((glob) => matchesFile(glob, manifestPath)) && commits.length > 0
    );

  ctx.log.debug(
    { filteredPathPairs },
    `Found ${filteredPathPairs.length} manifest/lockfile pairs to diff`
  );

  // Short circuit
  if (filteredPathPairs.length === 0) {
    return [];
  }

  // Use a Set so we only keep distinct package names.
  const changedDependencyNames = new Set<string>();

  await Promise.all(
    filteredPathPairs.map(async ([manifestPath, lockfilePath, commits]) => {
      const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromatic'));
      const temporaryManifestPath = path.join(tmpdir, path.basename(manifestPath));
      const temporaryLockfilePath = path.join(tmpdir, path.basename(lockfilePath));

      fs.copyFileSync(manifestPath, temporaryManifestPath);
      fs.copyFileSync(lockfilePath, temporaryLockfilePath);

      const headDependencies = await getDependencies(ctx, {
        rootPath: tmpdir,
        manifestPath: temporaryManifestPath,
        lockfilePath: temporaryLockfilePath,
      });

      ctx.log.debug(
        {
          manifestPath,
          lockfilePath,
          headDependencies: headDependencies.getDepPkgs().map((pkg) => pkg.name),
        },
        `Found HEAD dependencies`
      );

      // Retrieve the union of dependencies which changed compared to each baseline.
      // A change means either the version number is different or the dependency was added/removed.
      // If a manifest or lockfile is missing on the baseline, this throws and we'll end up bailing.
      await Promise.all(
        commits.map(async (reference) => {
          const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromatic'));

          const baselineChanges = await compareBaseline(ctx, headDependencies, {
            ref: reference,
            rootPath: tmpdir,
            manifestPath: await checkoutFile(ctx, reference, manifestPath, tmpdir),
            lockfilePath: await checkoutFile(ctx, reference, lockfilePath, tmpdir),
          });
          for (const change of baselineChanges) {
            changedDependencyNames.add(change);
          }
        })
      );
    })
  );

  return [...changedDependencyNames];
};
