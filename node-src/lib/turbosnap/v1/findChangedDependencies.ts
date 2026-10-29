import { DepGraph } from '@snyk/dep-graph';
import fs from 'fs';
import os from 'os';
import pLimit from 'p-limit';
import path from 'path';

import {
  ChangedFileWithStatus,
  checkoutFile,
  findFilesFromRepositoryRoot,
  getRepositoryRoot,
} from '../../../git/git';
import { Context } from '../../../types';
import { matchesFile, SUPPORTED_LOCK_FILES } from '../../utilities';
import { classifyManifestChange, getManifestChanges } from './classifyBailRootCause';
import { compareBaseline } from './compareBaseline';
import { BaselineCheckoutFailedError } from './errors';
import { getDependencies } from './getDependencies';

const PACKAGE_JSON = 'package.json';

// Yields a list of dependency names which have changed since the baseline.
// E.g. ['react', 'react-dom', '@storybook/react']
// TODO: refactor this function
// eslint-disable-next-line complexity,max-statements
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

  const rootPath = (await getRepositoryRoot(ctx)) || '';
  const [rootManifestPath] = (await findFilesFromRepositoryRoot(ctx, rootPath, PACKAGE_JSON)) || [];
  const [rootLockfilePath] =
    (await findFilesFromRepositoryRoot(ctx, rootPath, ...SUPPORTED_LOCK_FILES)) || [];
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
  const nestedManifestPaths =
    (await findFilesFromRepositoryRoot(ctx, rootPath, `**/${PACKAGE_JSON}`)) || [];
  ctx.log.debug({ nestedManifestPaths: nestedManifestPaths.length }, 'Found nested manifest paths');

  const manifestConcurrency = ctx.env.CHROMATIC_TURBOSNAP_MANIFEST_CONCURRENCY;
  const manifestLimit = pLimit(manifestConcurrency);
  const metadataPathPairs = await Promise.all(
    nestedManifestPaths.map((manifestPath) =>
      manifestLimit(async () => {
        const dirname = path.dirname(manifestPath);
        const [lockfilePath] =
          (await findFilesFromRepositoryRoot(
            ctx,
            rootPath,
            ...SUPPORTED_LOCK_FILES.map((lockfile) => `${dirname}/${lockfile}`)
          )) || [];
        // Fall back to the root lockfile if we can't find one in the same directory.
        return [manifestPath, lockfilePath || rootLockfilePath];
      })
    )
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
  const tmpdirsCreated = new Set<string>();
  let addedManifestError: BaselineCheckoutFailedError | undefined;
  let incompleteBaselineGraph = false;
  const addedWorkspaceNames = new Set<string>();
  const addedWorkspaceDependencies = new Set<DepGraph>();
  const baselineDependencyNames = new Set<string>();
  const baselinePackageIds = new Set<string>();
  const existingDependencyChanges = new Set<string>();
  const manifestChangesByReference = new Map<string, Promise<ChangedFileWithStatus[]>>();

  const packageConcurrency = ctx.env.CHROMATIC_TURBOSNAP_PACKAGE_CONCURRENCY;
  const headDependenciesLimit = pLimit(packageConcurrency);
  const baseDependenciesLimit = pLimit(packageConcurrency);

  try {
    await Promise.all(
      filteredPathPairs.map(([manifestPath, lockfilePath, commits]) =>
        headDependenciesLimit(async () => {
          const headDependencies = await getDependencies(ctx, {
            rootPath,
            manifestPath,
            lockfilePath,
          });

          ctx.log.debug({ manifestPath, lockfilePath }, `Found HEAD dependencies`);

          // Retrieve the union of dependencies which changed compared to each baseline.
          // A change means either the version number is different or the dependency was added/removed.
          // Missing baseline metadata still throws unless the manifest is a verified addition.
          await Promise.all(
            commits.map((reference) =>
              baseDependenciesLimit(async () => {
                // Check the baseline pair out into a temporary directory that mirrors the
                // repository layout, so the manifest keeps its position relative to the lockfile.
                const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromatic'));
                tmpdirsCreated.add(tmpdir);
                // A new workspace has no manifest at older baselines. Check the lockfile
                // first so an unavailable baseline lockfile still preserves the fallback.
                await checkoutFile(ctx, reference, lockfilePath, tmpdir);
                try {
                  await checkoutFile(ctx, reference, manifestPath, tmpdir);
                } catch (error) {
                  const addedWorkspace = await getAddedWorkspace(
                    ctx,
                    rootPath,
                    reference,
                    manifestPath,
                    error,
                    manifestChangesByReference
                  );
                  addedManifestError = addedWorkspace.error;
                  addedWorkspaceNames.add(addedWorkspace.name);
                  addedWorkspaceDependencies.add(headDependencies);
                  ctx.log.debug(
                    { manifestPath, reference },
                    'Treating added workspace and its new dependencies as changed'
                  );
                  return;
                }

                const baselineDependencies = await getDependencies(ctx, {
                  rootPath: tmpdir,
                  manifestPath,
                  lockfilePath,
                });

                ctx.log.debug({ reference }, `Found baseline dependencies`);

                for (const dependency of baselineDependencies.getDepPkgs()) {
                  baselineDependencyNames.add(dependency.name);
                  baselinePackageIds.add(packageId(dependency));
                }
                // Include the root package when checking for name collisions. A graph
                // without root metadata must not qualify for the addition exception.
                if (baselineDependencies.rootPkg) {
                  baselineDependencyNames.add(baselineDependencies.rootPkg.name);
                  baselinePackageIds.add(packageId(baselineDependencies.rootPkg));
                } else {
                  incompleteBaselineGraph = true;
                }
                const baselineChanges = await compareBaseline(
                  headDependencies,
                  baselineDependencies
                );
                for (const change of baselineChanges) {
                  existingDependencyChanges.add(change);
                  changedDependencyNames.add(change);
                }
              })
            )
          );
        })
      )
    );
  } finally {
    for (const tmpdir of tmpdirsCreated) {
      fs.rmSync(tmpdir, { recursive: true, force: true });
    }
  }

  // Build graphs can omit runtime dependencies. An added workspace must not remove
  // the original fallback for other dependency changes, across any baseline.
  // Only references to genuinely new workspace names qualify for the exception.
  if (
    addedManifestError &&
    (incompleteBaselineGraph ||
      [...existingDependencyChanges].some(
        (name) => !addedWorkspaceNames.has(name) || baselineDependencyNames.has(name)
      ))
  ) {
    throw addedManifestError;
  }

  // An added workspace is itself changed, but its dependencies only count where the exact version
  // is new to the repository. A version already present in a baseline graph installs the same
  // files, and an existing workspace that now resolves a dependency differently is already caught
  // by `compareBaseline` above. Marking every dependency would re-test any story importing a
  // shared package such as `react`.
  for (const name of addedWorkspaceNames) {
    changedDependencyNames.add(name);
  }
  for (const dependencies of addedWorkspaceDependencies) {
    for (const dependency of dependencies.getDepPkgs()) {
      if (!baselinePackageIds.has(packageId(dependency))) {
        changedDependencyNames.add(dependency.name);
      }
    }
  }

  return [...changedDependencyNames];
};

const packageId = ({ name, version }: { name: string; version?: string }) => `${name}@${version}`;

/**
 * Verify that a failed baseline checkout belongs to a newly added workspace.
 *
 * @param ctx CLI context.
 * @param rootPath Repository root.
 * @param reference Baseline commit.
 * @param manifestPath Repository-relative manifest path.
 * @param error Original checkout failure to preserve for all other cases.
 * @param manifestChangesByReference Manifest diffs already requested, keyed by baseline commit.
 *
 * @returns The new workspace name and original checkout failure.
 */
async function getAddedWorkspace(
  ctx: Context,
  rootPath: string,
  reference: string,
  manifestPath: string,
  error: unknown,
  manifestChangesByReference: Map<string, Promise<ChangedFileWithStatus[]>>
) {
  if (
    !(error instanceof BaselineCheckoutFailedError) ||
    error.pathspec !== `${reference}:${manifestPath}`
  ) {
    throw error;
  }
  // Every manifest shares the `package.json` basename, so one diff per baseline covers all of
  // them, and a manifest moved between directories still shows up as a rename, not an addition.
  let changes = manifestChangesByReference.get(reference);
  if (!changes) {
    changes = getManifestChanges(ctx, reference, manifestPath);
    manifestChangesByReference.set(reference, changes);
  }
  if (classifyManifestChange(await changes, manifestPath) !== 'baselineManifestAdded') {
    throw error;
  }
  const manifest = readAddedManifest(rootPath, manifestPath, error);
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    !('name' in manifest) ||
    typeof manifest.name !== 'string'
  ) {
    throw error;
  }
  return { name: manifest.name, error };
}

/**
 * Read an added manifest only when its resolved target stays inside the repository.
 *
 * @param rootPath Repository root.
 * @param manifestPath Repository-relative manifest path from Git.
 * @param error Original checkout failure to preserve for paths outside the repository.
 *
 * @returns The manifest contents for name validation.
 */
function readAddedManifest(
  rootPath: string,
  manifestPath: string,
  error: BaselineCheckoutFailedError
): unknown {
  // Resolve symlinks in both paths before comparing, including symlinked checkouts.
  const realRoot = fs.realpathSync(rootPath);
  const realManifest = fs.realpathSync(path.resolve(realRoot, manifestPath));
  const relativePath = path.relative(realRoot, realManifest);
  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw error;
  }
  return JSON.parse(fs.readFileSync(realManifest, 'utf8'));
}
