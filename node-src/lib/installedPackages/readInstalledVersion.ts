import { existsSync, readFileSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';

import { Logger } from '../log';

/**
 * Reads a package's installed version from its own `package.json`, resolved from a directory the
 * way Node resolves it: up through every ancestor `node_modules`, or through a Yarn Plug'n'Play
 * runtime when one is active in this process.
 *
 * @param log The logger to record a resolution failure with.
 * @param fromDirectory The absolute directory to resolve from.
 * @param packageName The package to read the version of.
 *
 * @returns The installed version, or undefined when the package cannot be resolved or read.
 */
export function readInstalledVersion(
  log: Logger,
  fromDirectory: string,
  packageName: string
): string | undefined {
  const requireFromDirectory = createRequire(path.join(fromDirectory, 'package.json'));

  try {
    const packageJsonPath = resolvePackageJson(requireFromDirectory, packageName);
    const { version } = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    return version;
  } catch (error) {
    log.debug(`Could not resolve ${packageName} from ${fromDirectory}`, error);
    // Marking which candidates exist tells a checkout with no install apart from one whose install
    // lacks the package.
    log.debug(
      'Directories checked:',
      requireFromDirectory.resolve
        .paths(`${packageName}/package.json`)
        ?.map((directory) => (existsSync(directory) ? directory : `${directory} (missing)`))
    );
    return undefined;
  }
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
