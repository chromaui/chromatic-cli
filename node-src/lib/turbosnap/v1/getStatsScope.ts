import fs from 'fs';
import path from 'path';

import { AbsolutePath, Module, Stats } from '../../../types';
import {
  getPackageName,
  isNodeModulesPath,
  moduleFileNames,
  normalizeStatsName,
} from '../statsPaths';

/** The workspaces a Storybook loads, and which of them import each installed package. */
export interface StatsScope {
  /** Repository-relative paths of the workspace `package.json` files the Storybook loads. */
  loadedManifestPaths: Set<string>;
  /** The manifest paths of the workspaces whose own files import each installed package, by name. */
  importersByPackage: Map<string, Set<string>>;
  /** Installed packages imported by a file that belongs to no loaded workspace. */
  unattributedPackages: Set<string>;
}

// Extensions of the modules whose imports resolve from their own workspace. Loaders turn other
// files (CSS and the like) into modules that import runtimes the builder resolves itself.
const SCRIPT_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.vue',
  '.svelte',
  '.mdx',
]);

// The installed package a normalized path belongs to, and that copy's `node_modules/<name>/`
// directory.
const installedPackageOf = (filePath: string) => {
  const packageName = isNodeModulesPath(filePath) ? getPackageName(`/${filePath}`) : undefined;
  const marker = `node_modules/${packageName}/`;
  const index = packageName ? filePath.lastIndexOf(marker) : -1;
  return packageName && index !== -1
    ? { packageName, directory: filePath.slice(0, index + marker.length) }
    : undefined;
};

/**
 * Works out which workspaces a Storybook loads, and which of them import each installed package. A
 * first-party module belongs to the workspace of the nearest `package.json` above it, and a module
 * under `node_modules` to an installed package. Any other importer, including an installed package,
 * a generated module, a loader chain, a non-script file or a workspace reached through a symlink,
 * can't vouch for the copy it gets, so whatever it imports counts as possibly hoisted.
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

  // Reads a stats name once: the workspace its file belongs to if it's first-party code in the
  // repository, the workspace that vouches for what it imports, and the `node_modules/<name>/`
  // directory of the installed package it belongs to.
  const classified = new Map<string, ReturnType<typeof classifyName>>();
  const classifyName = (name: string) => {
    // Check the normalized path, since raw names can use Windows separators.
    const filePath = normalizeStatsName(name, rootPath, projectRoot);
    // Only a file in the checkout is first-party. Bundlers name generated modules (virtual
    // modules, stories entries, Yarn virtual paths, group labels) as if they were files in the
    // project, and those resolve their imports from whatever package made them.
    const firstParty =
      !isNodeModulesPath(filePath) &&
      // The platform check, since a file on another Windows drive normalizes to `D:/…`.
      !path.isAbsolute(filePath) &&
      !filePath.startsWith('../') &&
      // Yarn PnP patches `fs` to serve workspaces with peer dependencies from virtual paths under
      // `.yarn/`, which don't say which workspace they are.
      !filePath.split('/').includes('.yarn') &&
      fs.existsSync(path.join(rootPath, filePath));
    const workspace = firstParty ? findWorkspace(filePath) : undefined;
    // A loader chain (`…css-loader…!./src/Button.css`) and a non-script file import runtimes the
    // builder resolves, so they can't vouch for the copy they get.
    const vouches = !name.includes('!') && SCRIPT_EXTENSIONS.has(path.posix.extname(filePath));
    return {
      filePath,
      workspace,
      voucher: vouches ? workspace : undefined,
      installed: installedPackageOf(filePath),
    };
  };
  const classify = (name: string) => {
    let result = classified.get(name);
    if (!result) {
      result = classifyName(name);
      classified.set(name, result);
    }
    return result;
  };

  const packageNamesByDirectory = new Map<string, string>();
  const importedDirectories = new Set<string>();

  // rspack can name a module by a group label and keep its file only in `nameForCondition`, and a
  // reason names its importer by that label. A loader chain keeps its own name, which says a
  // loader made the importer.
  const fileNames = new Map(
    stats.modules.map((module_) => [module_.name, moduleFileNames(module_)[0]])
  );

  const addModule = (module_: Module) => {
    // A module that only ever appears as an importer, such as `.storybook/preview.ts` in Vite
    // stats, still belongs to the Storybook, so read the reasons as well as the modules.
    const members = moduleFileNames(module_).map((name) => classify(name));
    const importers = (module_.reasons || []).flatMap(({ moduleName }) =>
      moduleName
        ? classify(
            moduleName.includes('!') ? moduleName : (fileNames.get(moduleName) ?? moduleName)
          )
        : []
    );
    for (const { workspace } of [...members, ...importers]) {
      if (workspace) scope.loadedManifestPaths.add(workspace);
    }

    // A concatenated module's members can import each other without a reason, so each member
    // counts as an importer of the installed packages in the same module. A package's own files
    // importing each other don't change which copy is bundled, so they don't count.
    // An installed importer resolves whichever copy is hoisted to it, which may belong to a
    // workspace the Storybook doesn't load, so only a workspace importer can vouch for the copy it
    // gets.
    const candidates = [...new Set([...importers, ...members])];
    const installed = new Map(
      members.flatMap(({ installed }) =>
        installed ? [[installed.directory, installed.packageName]] : []
      )
    );
    for (const [directory, packageName] of installed) {
      packageNamesByDirectory.set(directory, packageName);
      const outside = candidates.filter(
        ({ filePath }) =>
          !filePath.startsWith(directory) || isNodeModulesPath(filePath.slice(directory.length))
      );
      if (outside.length === 0) continue;
      importedDirectories.add(directory);
      for (const { voucher } of outside) {
        if (!voucher) {
          scope.unattributedPackages.add(packageName);
          continue;
        }
        const vouchers = scope.importersByPackage.get(packageName) ?? new Set();
        vouchers.add(voucher);
        scope.importersByPackage.set(packageName, vouchers);
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
