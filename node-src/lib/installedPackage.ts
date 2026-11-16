import fs, { existsSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';

/**
 * Reads an installed package's version from its own `package.json`, resolved from a directory the
 * way Node resolves it: up through every ancestor `node_modules`, or through a Yarn Plug'n'Play
 * runtime when one is active in this process.
 *
 * @param fromDirectory The absolute directory to resolve from.
 * @param packageName The package to read the version of.
 *
 * @returns The installed version.
 *
 * @throws {Error} When the package cannot be resolved or its `package.json` cannot be read.
 */
export function readInstalledPackageVersion(fromDirectory: string, packageName: string): string {
  const requireFromDirectory = createRequire(path.join(fromDirectory, 'package.json'));
  const packageJsonPath = resolvePackageJson(requireFromDirectory, packageName);
  // Read through the module object, not a named import: a Yarn Plug'n'Play runtime loaded after this
  // module patches `fs` in place, and a copy of `readFileSync` taken earlier can't open its archives.
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version;
}

/**
 * Resolves a package's own `package.json`. When the package's `exports` map leaves it out (as
 * `@chromatic-com/vitest` did before 1.0.2), Node refuses the subpath, so this looks for the file in
 * each `node_modules` Node searched. The first one there is the package Node found and refused.
 *
 * @param requireFromDirectory A `require` created for the directory to resolve from.
 * @param packageName The package whose manifest to find.
 *
 * @returns The absolute path of the package's `package.json`.
 */
function resolvePackageJson(
  requireFromDirectory: ReturnType<typeof createRequire>,
  packageName: string
): string {
  try {
    return requireFromDirectory.resolve(`${packageName}/package.json`);
  } catch (error) {
    if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error;

    const packageJsonPath = requireFromDirectory.resolve
      .paths(packageName)
      ?.map((directory) => path.join(directory, packageName, 'package.json'))
      .find((candidate) => existsSync(candidate));
    if (!packageJsonPath) throw error;
    return packageJsonPath;
  }
}
