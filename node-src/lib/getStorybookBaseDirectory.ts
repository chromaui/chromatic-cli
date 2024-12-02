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

  // NOTE:
  //  - path.relative does not have a leading '.', unless it starts with '../'
  //  - path.join('.', '') === '.' and path.join('.', '../x') = '../x'
  return posix(path.join('.', path.relative(rootPath, '')));
}
