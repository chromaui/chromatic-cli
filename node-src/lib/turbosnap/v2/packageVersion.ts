import { readFileSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';

/**
 * Reads a package's installed version from its own `package.json`, resolved from the project root.
 *
 * Resolves the package's manifest rather than a path inside it: `dist/*` entries are often absent
 * from the `exports` map, so resolving one fails with ERR_PACKAGE_PATH_NOT_EXPORTED. A package that
 * does not export `./package.json` either still fails, and reports no version. The manifest is
 * then read off disk rather than `require`d, which keeps it out of the require cache. Resolution
 * walks up from the project root, so a workspace-hoisted install is found too.
 *
 * @param projectRoot The absolute Storybook project root to resolve from.
 * @param packageName The package to read the version of.
 *
 * @returns The installed version, or undefined when the package cannot be resolved or read.
 */
export function resolvePackageVersion(
  projectRoot: string,
  packageName: string
): string | undefined {
  const requireFromProject = createRequire(path.join(projectRoot, 'package.json'));

  try {
    const packageJsonPath = requireFromProject.resolve(`${packageName}/package.json`);
    const { version } = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    return version;
  } catch {
    return undefined;
  }
}
