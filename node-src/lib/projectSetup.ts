import { existsSync, readdirSync } from 'fs';
import path from 'path';

import { AbsolutePath } from '../types';

type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

/**
 * How the project's dependencies are installed, read once from the files the install itself wrote.
 * Config is no help here: Yarn's linker can come from `~/.yarnrc.yml` or an environment variable.
 * Unlike `getPackageManagerName`, which picks the command that runs scripts, this reads the install.
 *
 * - `node_modules`: Node can resolve packages and read their files, whichever manager wrote them.
 * - `pnp`: Yarn Plug'n'Play. Packages live in zip archives that only the project's runtime can
 *   resolve and read; `pnpRuntime` says whether that runtime is active in this process.
 * - `not-installed`: nothing installed was found in the directory or any parent.
 * - `unknown`: a `node_modules` without a marker we recognize, such as Bun without workspaces.
 */
export type ProjectSetup =
  | { layout: 'node_modules'; packageManager: PackageManager; installRoot: AbsolutePath }
  | {
      layout: 'pnp';
      packageManager: 'yarn';
      installRoot: AbsolutePath;
      pnpFile: AbsolutePath;
      /** `failed` when this process tried to load the runtime and could not; see `pnpRuntime.ts`. */
      pnpRuntime: 'active' | 'inactive' | 'failed';
    }
  | { layout: 'not-installed'; packageManager?: 'yarn'; installRoot?: AbsolutePath }
  | { layout: 'unknown'; installRoot: AbsolutePath };

// The marker npm, Yarn 1 and Bun (with workspaces) write into the node_modules at the install root.
// pnpm and Yarn 2+ are checked first; see `detectInstallAt`. A workspace package's own node_modules
// holds no marker, so the walk goes past it to the root.
const NODE_MODULES_MARKERS: [string, PackageManager][] = [
  ['.package-lock.json', 'npm'],
  ['.yarn-integrity', 'yarn'],
  ['.bun', 'bun'],
];

/**
 * Detects how the project's dependencies are installed by walking from a directory up to the
 * filesystem root, the same directories Node's own resolution searches.
 *
 * @param fromDirectory The absolute directory to start from, normally the Storybook config directory.
 *
 * @returns The detected setup.
 */
export function detectProjectSetup(fromDirectory: AbsolutePath): ProjectSetup {
  let firstNodeModules: AbsolutePath | undefined;
  for (let directory = fromDirectory; ; directory = path.dirname(directory)) {
    const setup = detectInstallAt(directory);
    if (setup) return setup;

    if (!firstNodeModules && holdsPackages(path.join(directory, 'node_modules'))) {
      firstNodeModules = directory;
    }
    if (path.dirname(directory) === directory) break;
  }
  return firstNodeModules
    ? { layout: 'unknown', installRoot: firstNodeModules }
    : { layout: 'not-installed' };
}

// `storybook build` writes `node_modules/.cache` even where nothing is installed, and CI often
// restores it, so only a node_modules with a package in it counts as an install.
function holdsPackages(nodeModules: AbsolutePath) {
  try {
    return readdirSync(nodeModules).some((entry) => !entry.startsWith('.'));
  } catch {
    return false;
  }
}

function detectInstallAt(directory: AbsolutePath): ProjectSetup | undefined {
  const nodeModules = path.join(directory, 'node_modules');
  // pnpm comes first: its `nodeLinker: pnp` writes a `.pnp.cjs` next to a working node_modules.
  if (existsSync(path.join(nodeModules, '.modules.yaml'))) {
    return { layout: 'node_modules', packageManager: 'pnpm', installRoot: directory };
  }

  // Yarn 2+ writes `install-state.gz` for every linker. A `.pnp.cjs` without it, or without a cache
  // to read packages from, was committed rather than installed.
  const yarnInstalled =
    existsSync(path.join(directory, '.yarn', 'install-state.gz')) ||
    existsSync(path.join(directory, '.yarn', 'cache'));
  const pnpFile = path.join(directory, '.pnp.cjs');
  if (existsSync(pnpFile)) {
    return yarnInstalled
      ? {
          layout: 'pnp',
          packageManager: 'yarn',
          installRoot: directory,
          pnpFile,
          pnpRuntime: process.versions.pnp ? 'active' : 'inactive',
        }
      : { layout: 'not-installed', packageManager: 'yarn', installRoot: directory };
  }
  if (yarnInstalled && existsSync(nodeModules)) {
    return { layout: 'node_modules', packageManager: 'yarn', installRoot: directory };
  }

  for (const [marker, packageManager] of NODE_MODULES_MARKERS) {
    if (existsSync(path.join(nodeModules, marker))) {
      return { layout: 'node_modules', packageManager, installRoot: directory };
    }
  }
  return undefined;
}

/**
 * The setup as one short value, such as `yarn-pnp` or `not-installed`, for a Sentry tag.
 *
 * @param setup The detected setup.
 *
 * @returns The package manager, when known, and the layout.
 */
export function describeProjectSetup(setup: ProjectSetup): string {
  return 'packageManager' in setup && setup.packageManager
    ? `${setup.packageManager}-${setup.layout}`
    : setup.layout;
}

/** Thrown when nothing installed was found, so the manifest would hash no dependencies at all. */
export class DependenciesNotInstalledError extends Error {
  readonly name = 'DependenciesNotInstalledError';

  constructor(readonly configDirectory: AbsolutePath) {
    super(
      `Found no installed dependencies for the Storybook in ${configDirectory} or any parent directory. TurboSnap hashes installed dependencies, so they must be installed before running Chromatic, even for a prebuilt Storybook.`
    );
  }
}

/**
 * Thrown for a Yarn Plug'n'Play project whose runtime isn't active in this process. Without it, the
 * dependency files inside Yarn's zip archives can't be read, so the manifest would silently leave out
 * every dependency.
 */
export class PnpRuntimeInactiveError extends Error {
  readonly name = 'PnpRuntimeInactiveError';

  constructor(
    readonly pnpFile: AbsolutePath,
    readonly pnpRuntime: 'inactive' | 'failed'
  ) {
    super(
      `This project uses Yarn Plug'n'Play (${pnpFile}), and its runtime ${pnpRuntime === 'failed' ? 'failed to load' : "isn't loaded"} in this process, so TurboSnap can't read the installed dependencies. Run Chromatic through Yarn, such as with yarn chromatic.`
    );
  }
}

/**
 * Refuses a setup whose dependency files can't be read, rather than hashing a manifest without them.
 *
 * @param setup The detected setup.
 * @param configDirectory The absolute Storybook config directory the setup was detected from.
 */
export function assertDependenciesReadable(setup: ProjectSetup, configDirectory: AbsolutePath) {
  if (setup.layout === 'not-installed') throw new DependenciesNotInstalledError(configDirectory);
  if (setup.layout === 'pnp' && setup.pnpRuntime !== 'active') {
    throw new PnpRuntimeInactiveError(setup.pnpFile, setup.pnpRuntime);
  }
}
