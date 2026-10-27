import fs from 'fs';
import path from 'path';
import {
  extractPkgsFromYarnLockV1,
  extractPkgsFromYarnLockV2,
  getPnpmLockfileParser,
  getYarnLockfileVersion,
  NodeLockfileVersion,
} from 'snyk-nodejs-lockfile-parser';

import { Context } from '../../../types';
import { PNPM_LOCK_FILE } from '../../utilities';
import { ensureLockFileSize } from './getDependencies';
import { getVersionFromPath } from './statsPaths';

/**
 * The versions a lockfile installs: by install path for npm, which records where each copy goes,
 * and by package name for Yarn and pnpm, which don't.
 */
export type LockfileVersions = {
  /**
   * Names with a copy the lockfile doesn't install from the registry under that name: git, `file:`,
   * `link:` and URL dependencies, workspace links, npm aliases, and patches. Their version doesn't
   * pin what's installed.
   */
  notFromRegistry: Set<string>;
} & (
  | {
      format: 'npm';
      /** Version by repository-relative install directory, such as `node_modules/react`. */
      byPath: Map<string, string>;
    }
  | {
      format: 'pnpm' | 'yarn';
      /** Every version of each package name the lockfile installs from the registry. */
      byName: Map<string, Set<string>>;
    }
);

/** A package a lockfile installs, or a name it installs something else under. */
interface LockfileEntry {
  name: string;
  version?: string;
  /** Whether the lockfile installs it from the registry under its own name. */
  fromRegistry: boolean;
  /** Its repository-relative install directory. npm only. */
  path?: string;
}

const getFormat = (lockfilePath: string) => {
  const fileName = lockfilePath.split('/').at(-1);
  if (fileName === 'package-lock.json') return 'npm';
  return fileName === PNPM_LOCK_FILE ? 'pnpm' : 'yarn';
};

/**
 * Lists the versions a lockfile installs, without building a dependency graph.
 *
 * @param lockfile The lockfile's contents.
 * @param lockfilePath The lockfile's repository-relative path.
 *
 * @returns The versions it installs.
 */
export function readLockfileVersions(lockfile: string, lockfilePath: string): LockfileVersions {
  const format = getFormat(lockfilePath);
  const entries = {
    npm: () => readPackageLock(lockfile, lockfilePath.replace(/[^/]*$/, '')),
    pnpm: () => readPnpmLock(lockfile),
    yarn: () => readYarnLock(lockfile),
  }[format]();

  const notFromRegistry = new Set(
    entries.filter((entry) => !entry.fromRegistry).map(({ name }) => name)
  );
  if (format === 'npm') {
    const byPath = new Map<string, string>();
    for (const { path: directory, version } of entries) {
      if (directory && version) byPath.set(directory, version);
    }
    return { format, byPath, notFromRegistry };
  }

  const byName = new Map<string, Set<string>>();
  for (const { name, version, fromRegistry } of entries) {
    if (version && fromRegistry) byName.set(name, (byName.get(name) ?? new Set()).add(version));
  }
  return { format, byName, notFromRegistry };
}

// A registry tarball of `name`, which npm, Yarn 1 and pnpm record as
// `<registry>/<name>/-/<unscoped name>-<version>.tgz`, with a `#<hash>` from Yarn 1. The package
// path must be exactly `name`: an unscoped `is` is not `@sindresorhus/is`.
const isRegistryTarball = (url: string, name: string) => {
  const [, packagePath, file] =
    /^https?:\/\/.+?\/((?:@[^/]+\/)?[^/@][^/]*)\/-\/([^/]+)\.tgz(?:#.*)?$/.exec(url) ?? [];
  return packagePath === name && file.startsWith(`${name.split('/').at(-1)}-`);
};

// The name in a `name@range` key, which is scoped when it starts with `@`.
const nameOfKey = (key: string) => key.slice(0, key.indexOf('@', 1));

interface PackageLockEntry {
  name?: string;
  version?: string;
  resolved?: string;
  link?: boolean;
}

// Lockfile v2 and v3 key every installed copy by its path relative to the lockfile. A copy npm
// installed from the registry under its own name has no link, no other recorded `name` (as an
// alias has), and a registry tarball, if any: git, `file:` and URL dependencies resolve elsewhere.
function readPackageLock(lockfile: string, prefix: string): LockfileEntry[] {
  const { packages = {} } = JSON.parse(lockfile);
  return Object.entries<PackageLockEntry>(packages).flatMap(([key, entry]) => {
    const name = key.split('node_modules/').at(-1);
    if (!key.includes('node_modules/') || !name) return [];

    const { name: realName = name, version, resolved, link } = entry;
    const fromRegistry =
      !link && realName === name && (!resolved || isRegistryTarball(resolved, name));
    return [{ name, version: link ? undefined : version, fromRegistry, path: `${prefix}${key}` }];
  });
}

interface PnpmPackage {
  name?: string;
  version?: string;
  resolution?: { tarball?: string; type?: string };
  dependencies?: PnpmDependencies;
  optionalDependencies?: PnpmDependencies;
}

// Dependencies by name, as their version before v6 and as `{ specifier, version }` after.
type PnpmDependencies = Record<string, string | { version?: string }>;

type PnpmParser = ReturnType<typeof getPnpmLockfileParser>;

// pnpm keys packages by `name@version(peers)`, with a leading `/` before v9 and as
// `/name/version_peers` in v5. A registry package's resolution is just its integrity, or a
// registry tarball: git and directory packages have a `type`, and other tarballs a different URL.
// Patched packages are listed under `patchedDependencies`, as `name@version` or `name`, and their
// keys carry a `patch_hash`.
function readPnpmLock(lockfile: string): LockfileEntry[] {
  const parser = getPnpmLockfileParser(lockfile);
  const { patchedDependencies = {}, packages = {}, snapshots = {} } = parser.rawPnpmLock ?? {};
  const parseKey = (depPath: string) =>
    parser.parseDepPath(parser.excludeTransPeerDepsVersions(depPath));

  const installed = Object.entries<PnpmPackage>(parser.packages).flatMap(([depPath, data]) => {
    const { name, version } = data.name && data.version ? data : parseKey(depPath);
    if (!name) return [];

    const { tarball, type } = data.resolution ?? {};
    const fromRegistry = !!version && !type && (!tarball || isRegistryTarball(tarball, name));
    return [{ name, version, fromRegistry }];
  });
  const patched = [
    ...Object.keys(patchedDependencies).map((key) => (key.includes('@', 1) ? nameOfKey(key) : key)),
    ...[...Object.keys(packages), ...Object.keys(snapshots)]
      .filter((key) => key.includes('patch_hash='))
      .map((key) => parseKey(key).name ?? ''),
  ].map((name) => ({ name, fromRegistry: false }));

  return [...installed, ...patched, ...getPnpmDependenciesElsewhere(parser)];
}

// Names a pnpm lockfile installs something else under: dependencies whose version isn't a
// version, such as an alias (`is-odd@3.0.1`), `link:`, `file:` or a URL. With
// `node-linker=hoisted`, an alias is a real `node_modules/<alias>` directory. Dependencies are
// listed per importer, at the top level of a single project's lockfile before v9, and per package.
function getPnpmDependenciesElsewhere(parser: PnpmParser): LockfileEntry[] {
  const raw = parser.rawPnpmLock ?? {};
  const importers: Record<string, PnpmPackage & { devDependencies?: PnpmDependencies }>[] = [
    raw,
    ...Object.values<Record<string, any>>(raw.importers ?? {}),
  ];
  const dependencyLists: PnpmDependencies[] = [
    ...importers.flatMap((importer) => [
      importer.dependencies,
      importer.devDependencies,
      importer.optionalDependencies,
    ]),
    ...Object.values<PnpmPackage>(parser.packages).flatMap((pkg) => [
      pkg.dependencies,
      pkg.optionalDependencies,
    ]),
  ].filter((dependencies): dependencies is PnpmDependencies => !!dependencies);

  return dependencyLists.flatMap((dependencies) =>
    Object.entries(dependencies)
      .filter(([, dependency]) => {
        const version = typeof dependency === 'string' ? dependency : dependency?.version;
        return typeof version === 'string' && !/^\d/.test(version);
      })
      .map(([name]) => ({ name, fromRegistry: false }))
  );
}

interface YarnPackage {
  version?: string;
  resolved?: string;
  resolution?: string;
}

// yarn.lock entries are keyed by `name@range`. Yarn 1 records a `resolved` tarball, and Berry a
// `resolution` of `name@npm:<version>` for a registry package. A git, file, patch or workspace
// package, or an alias, resolves to something else.
function readYarnLock(lockfile: string): LockfileEntry[] {
  const isBerry = getYarnLockfileVersion(lockfile) === NodeLockfileVersion.YarnLockV2;
  const packages = isBerry
    ? extractPkgsFromYarnLockV2(lockfile)
    : extractPkgsFromYarnLockV1(lockfile);

  return Object.entries<YarnPackage>(packages).map(([key, { version, resolved, resolution }]) => {
    const name = nameOfKey(key);
    const fromRegistry = isBerry
      ? resolution === `${name}@npm:${version}`
      : resolved !== undefined && isRegistryTarball(resolved, name);
    return { name, version, fromRegistry };
  });
}

/**
 * Finds the lockfile that installed a package: the nearest one in a directory above it.
 *
 * @param lockfilePaths The repository-relative paths of the repository's lockfiles.
 * @param directory The package's repository-relative `node_modules/<name>` directory.
 *
 * @returns The lockfile's path, or `undefined` when the package is outside every lockfile's tree.
 */
export function findNearestLockfile(lockfilePaths: Iterable<string>, directory: string) {
  if (path.posix.isAbsolute(directory) || directory.startsWith('../')) return undefined;

  let nearest: { lockfilePath: string; prefix: string } | undefined;
  for (const lockfilePath of lockfilePaths) {
    const lockfileDirectory = path.posix.dirname(lockfilePath);
    const prefix = lockfileDirectory === '.' ? '' : `${lockfileDirectory}/`;
    // Compare directories, not paths: the root `pnpm-lock.yaml` is longer than `ui/yarn.lock`.
    if (directory.startsWith(prefix) && (!nearest || prefix.length > nearest.prefix.length)) {
      nearest = { lockfilePath, prefix };
    }
  }
  return nearest?.lockfilePath;
}

/**
 * Finds the version of an installed package the Storybook loads. Prefers the version its path
 * carries, then the copy the lockfile that installed it records: npm's at that path, or the only
 * version a Yarn or pnpm lockfile installs. Those don't say where a copy was hoisted, so a name they
 * install at several versions stays unknown.
 *
 * @param lockfile The versions the lockfile nearest to the package installs.
 * @param directory The package's repository-relative `node_modules/<name>` directory.
 * @param name The package name.
 *
 * @returns The version, or `undefined` when it can't be told.
 */
export function findLoadedVersion(lockfile: LockfileVersions, directory: string, name: string) {
  const fromPath = getVersionFromPath(directory, name);
  if (fromPath) return fromPath;
  if (lockfile.format === 'npm') return lockfile.byPath.get(directory);

  const versions = [...(lockfile.byName.get(name) ?? [])];
  return versions.length === 1 ? versions[0] : undefined;
}

/**
 * Reads the version of an installed copy from its `package.json` on disk. Only a last resort for
 * when the lockfiles can't tell which copy was hoisted, because `node_modules` may not exist.
 *
 * @param rootPath The absolute repository root.
 * @param directory The package's repository-relative `node_modules/<name>` directory.
 * @param name The package name, which the `package.json` must have.
 *
 * @returns The version, or `undefined` when there's no readable `package.json` of that package in
 * the repository, or the directory is a symlink.
 */
export function readInstalledVersion(rootPath: string, directory: string, name: string) {
  // Stats paths come from the build, so never read outside the repository.
  const manifestPath = path.resolve(rootPath, directory, 'package.json');
  if (!manifestPath.startsWith(path.resolve(rootPath) + path.sep)) return undefined;

  try {
    // A symlinked directory is a workspace or a `link:` dependency, which Yarn 1 doesn't record.
    if (fs.lstatSync(path.dirname(manifestPath)).isSymbolicLink()) return undefined;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    // An alias's directory holds another package.
    if (manifest.name !== name) return undefined;
    return typeof manifest.version === 'string' ? manifest.version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Looks up the versions of installed copies whose version can be trusted to pin their contents,
 * reading each lockfile at most once.
 *
 * @param ctx The context set when executing the CLI.
 * @param rootPath The absolute repository root.
 * @param lockfilePaths The repository-relative paths of the repository's lockfiles.
 *
 * @returns `findVersion(directory, name)`, which returns the version of the copy in a
 * `node_modules/<name>` directory: as `findLoadedVersion` finds it, or from its `package.json` on
 * disk unless an npm lockfile installed it. It returns `undefined` for anything else, and for a copy that isn't installed from the
 * registry under that name, or whose lockfile can't be found or read.
 */
export function createVersionLookup(ctx: Context, rootPath: string, lockfilePaths: string[]) {
  // `undefined` marks a lockfile that couldn't be read.
  const lockfiles = new Map<string, LockfileVersions | undefined>();
  const readLockfile = (lockfilePath: string) => {
    if (!lockfiles.has(lockfilePath)) {
      try {
        const absolutePath = path.join(rootPath, lockfilePath);
        ensureLockFileSize(ctx, absolutePath);
        lockfiles.set(
          lockfilePath,
          readLockfileVersions(fs.readFileSync(absolutePath, 'utf8'), lockfilePath)
        );
      } catch (err) {
        ctx.log.debug({ err, lockfilePath }, 'Could not read the versions a lockfile installs');
        lockfiles.set(lockfilePath, undefined);
      }
    }
    return lockfiles.get(lockfilePath);
  };

  const findVersion = (directory: string, name: string) => {
    // Only a `node_modules/<name>` directory is a copy whose version the lockfiles describe.
    if (!directory.endsWith(`node_modules/${name}`)) return undefined;

    // Without a lockfile, nothing says whether the copy came from the registry.
    const lockfilePath = findNearestLockfile(lockfilePaths, directory);
    const lockfile = lockfilePath && readLockfile(lockfilePath);
    if (!lockfile || lockfile.notFromRegistry.has(name)) return undefined;

    // npm records every copy it installs, so a copy its lockfile doesn't list wasn't installed
    // from it, as with a v1 lockfile or one that's out of sync.
    return (
      findLoadedVersion(lockfile, directory, name) ??
      (lockfile.format === 'npm' ? undefined : readInstalledVersion(rootPath, directory, name))
    );
  };
  return { findVersion };
}

export type VersionLookup = ReturnType<typeof createVersionLookup>;
