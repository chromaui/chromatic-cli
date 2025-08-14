import path from 'path';

import { Context } from '../types';
import { posix } from './posix';

/**
 * Get the storybook base directory, relative to the git root.
 * This is where you run SB from, NOT the config dir.
 *
 * @param ctx Context Regular context
 *
 * @returns string The base directory
 */
export function getStorybookBaseDirectory(ctx: Context) {
  const { storybookBaseDir } = ctx.options || {};
  if (storybookBaseDir) {
    return storybookBaseDir;
  }

  const { rootPath } = ctx.git || {};
  if (!rootPath) {
    return '.';
  }

  // When workingDir is used in GitHub Actions, process.cwd() changes but we need
  // the base directory relative to the original git root. Calculate the relative path
  // from git root to the current working directory.
  const currentDir = process.cwd();
  const baseDir = path.relative(rootPath, currentDir);
  
  // Normalize to posix path and ensure it doesn't start with './' for consistency
  const normalizedBaseDir = posix(baseDir === '' ? '.' : baseDir);
  
  return normalizedBaseDir;
}
