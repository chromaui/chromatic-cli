import path from 'path';

import { posix } from './posix';

/**
 * Get the storybook base directory, relative to the git root.
 * This is where you run SB from, NOT the config dir.
 *
 * @param input The base directory configured by the user (if any) and the git
 *   root path discovered by gitInfo.
 * @param input.storybookBaseDir User-supplied base directory override.
 * @param input.gitRootPath Absolute path of the git project root.
 *
 * @returns The base directory.
 */
export function getStorybookBaseDirectory({
  storybookBaseDir,
  gitRootPath,
}: {
  storybookBaseDir?: string;
  gitRootPath?: string;
}) {
  if (storybookBaseDir) {
    return storybookBaseDir;
  }

  if (!gitRootPath) {
    return '.';
  }

  // NOTE:
  //  - path.relative does not have a leading '.', unless it starts with '../'
  //  - path.join('.', '') === '.' and path.join('.', '../x') = '../x'
  return posix(path.join('.', path.relative(gitRootPath, '')));
}
