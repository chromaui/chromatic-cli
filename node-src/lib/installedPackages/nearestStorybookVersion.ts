import { existsSync, readFileSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';

import { Logger } from '../log';
import { readInstalledVersion } from './readInstalledVersion';
import { readStorybookVersion, VersionNotFoundError } from './storybookVersion';

/**
 * Reads the installed Storybook version with `readStorybookVersion`, one `node_modules` at a time,
 * nearest the config directory first. A monorepo can install an older Storybook in a package and a
 * newer `storybook` at its root. Node builds that package with its own, nearer Storybook, but the
 * chain's order alone would pick the root's `storybook`, because it tries that package first.
 *
 * Under an active Yarn Plug'n'Play runtime, packages resolve through the runtime rather than through
 * directories, so this resolves the chain from the config directory instead.
 *
 * @param log The logger to record a resolution failure with.
 * @param configDirectory The absolute Storybook config directory to resolve from.
 *
 * @returns The installed Storybook version, such as `9.1.20`.
 *
 * @throws {VersionNotFoundError} When no Storybook package resolves with a usable version.
 */
export function readNearestStorybookVersion(log: Logger, configDirectory: string): string {
  if (!process.versions.pnp) {
    const directories =
      createRequire(path.join(configDirectory, 'package.json')).resolve.paths('storybook') ?? [];
    for (const directory of directories.filter((candidate) => existsSync(candidate))) {
      try {
        return readStorybookVersion(directory, readVersionIn);
      } catch (error) {
        if (!(error instanceof VersionNotFoundError)) throw error;
      }
    }
  }

  return readStorybookVersion(configDirectory, (fromDirectory, packageName) =>
    readInstalledVersion(log, fromDirectory, packageName)
  );
}

// Reads a package installed directly in one `node_modules`, following a link such as pnpm's.
function readVersionIn(nodeModules: string, packageName: string): string | undefined {
  const packageJsonPath = path.join(nodeModules, packageName, 'package.json');
  if (!existsSync(packageJsonPath)) return undefined;
  return JSON.parse(readFileSync(packageJsonPath, 'utf8')).version;
}
