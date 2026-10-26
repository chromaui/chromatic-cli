import path from 'path';

import { AbsolutePath, Module, Stats } from '../../../types';
import { getPackageName, normalizeStatsName } from './statsPaths';

const NODE_MODULES = /(^|\/)node_modules\//;

/** The workspaces a Storybook loads, and which of them import each installed package. */
export interface StatsScope {
  /** Repository-relative paths of the workspace `package.json` files the Storybook loads. */
  loadedManifestPaths: Set<string>;
  /** The manifest paths of the workspaces whose own files import each installed package, by name. */
  importersByPackage: Map<string, Set<string>>;
  /** Installed packages imported by a file that belongs to no loaded workspace. */
  unattributedPackages: Set<string>;
}

// Yarn PnP serves workspaces with peer dependencies from virtual paths, which don't say which
// workspace they are without resolving them.
const YARN_VIRTUAL = /(^|\/)\.yarn\/__virtual__\//;

// Bundler-generated modules (`virtual:…`, `\0…`) belong to whatever plugin or preset made them,
// which resolves its imports from its own installed package.
// webpack builders generate theirs as virtual files that look like files in the project.
const GENERATED =
  /\0|virtual:|(^|\/)(storybook-config-entry|storybook-stories|generated-stories-entry)\.c?js$/;

/**
 * Works out which workspaces a Storybook loads, and which of them import each installed package. A
 * first-party module belongs to the workspace of the nearest `package.json` above it, and a module
 * under `node_modules` to an installed package. Any other importer, including an installed package,
 * a generated module or a workspace reached through a symlink, isn't attributed to a workspace, so
 * whatever it imports counts as possibly hoisted.
 *
 * @param stats The parsed stats file of the Storybook build.
 * @param options Where the stats paths are relative to, and the workspaces to match them against.
 * @param options.rootPath The absolute repository root.
 * @param options.projectRoot The absolute Storybook project root, which relative stats paths are
 * relative to.
 * @param options.manifestPaths Repository-relative paths of every `package.json` in the repository.
 *
 * @returns The workspaces the Storybook loads and the importers of each installed package.
 */
export function getStatsScope(
  stats: Stats,
  {
    rootPath,
    projectRoot,
    manifestPaths,
  }: {
    rootPath: AbsolutePath;
    projectRoot: AbsolutePath;
    manifestPaths: string[];
  }
): StatsScope {
  const manifestPathsByDirectory = new Map(
    manifestPaths.map((manifestPath) => [path.posix.dirname(manifestPath), manifestPath])
  );
  const scope: StatsScope = {
    loadedManifestPaths: new Set(),
    importersByPackage: new Map(),
    unattributedPackages: new Set(),
  };

  const findWorkspace = (filePath: string) => {
    for (
      let directory = path.posix.dirname(filePath);
      ;
      directory = path.posix.dirname(directory)
    ) {
      const manifestPath = manifestPathsByDirectory.get(directory);
      if (manifestPath || directory === '.') return manifestPath;
    }
  };

  // The workspace a module's own file belongs to, if it's first-party code in the repository.
  const workspaces = new Map<string, string | undefined>();
  const workspaceOf = (name: string) => {
    if (!workspaces.has(name)) {
      const filePath = normalizeStatsName(name, rootPath, projectRoot);
      const firstParty =
        !NODE_MODULES.test(filePath) &&
        !GENERATED.test(filePath) &&
        !YARN_VIRTUAL.test(filePath) &&
        !path.posix.isAbsolute(filePath) &&
        !filePath.startsWith('../');
      workspaces.set(name, firstParty ? findWorkspace(filePath) : undefined);
    }
    return workspaces.get(name);
  };

  // The installed package a module belongs to, and that copy's `node_modules/<name>/` directory.
  const installedPackageOf = (name: string) => {
    const packageName = NODE_MODULES.test(name) ? getPackageName(name) : undefined;
    const filePath = normalizeStatsName(name, rootPath, projectRoot);
    const marker = `node_modules/${packageName}/`;
    const index = filePath.lastIndexOf(marker);
    return packageName && index !== -1
      ? { packageName, directory: filePath.slice(0, index + marker.length) }
      : undefined;
  };
  const isInside = (name: string, directory: string) => {
    const filePath = normalizeStatsName(name, rootPath, projectRoot);
    return filePath.startsWith(directory) && !NODE_MODULES.test(filePath.slice(directory.length));
  };
  const packageNamesByDirectory = new Map<string, string>();
  const importedDirectories = new Set<string>();

  // Records who imports an installed package. An installed importer resolves whichever copy is
  // hoisted to it, which may belong to a workspace the Storybook doesn't load, so only a workspace
  // importer can vouch for the copy it gets.
  const addImporter = (packageName: string, importer: string) => {
    const workspace = workspaceOf(importer);
    if (!workspace) {
      scope.unattributedPackages.add(packageName);
      return;
    }
    const importers = scope.importersByPackage.get(packageName) ?? new Set();
    importers.add(workspace);
    scope.importersByPackage.set(packageName, importers);
  };

  const addModule = (module_: Module) => {
    // A module that only ever appears as an importer, such as `.storybook/preview.ts` in Vite
    // stats, still belongs to the Storybook, so read the reasons as well as the modules.
    const members = [module_.name, ...(module_.modules || []).map((inner) => inner.name)].filter(
      Boolean
    );
    const importers = (module_.reasons || []).flatMap(({ moduleName }) => moduleName || []);
    for (const name of [...members, ...importers]) {
      const workspace = workspaceOf(name);
      if (workspace) scope.loadedManifestPaths.add(workspace);
    }

    // A concatenated module's members can import each other without a reason, so each member
    // counts as an importer of the installed packages in the same module. A package's own files
    // importing each other don't change which copy is bundled, so they don't count.
    const candidates = [...importers, ...members];
    for (const member of members) {
      const installed = installedPackageOf(member);
      if (!installed) continue;
      packageNamesByDirectory.set(installed.directory, installed.packageName);
      for (const importer of candidates) {
        if (importer === member || isInside(importer, installed.directory)) continue;
        importedDirectories.add(installed.directory);
        addImporter(installed.packageName, importer);
      }
    }
  };

  for (const module_ of stats.modules) addModule(module_);

  // A package nothing outside it imports, such as a webpack entry a preset added, has no importer
  // that can vouch for the copy it gets.
  for (const [directory, packageName] of packageNamesByDirectory) {
    if (!importedDirectories.has(directory)) scope.unattributedPackages.add(packageName);
  }
  return scope;
}
