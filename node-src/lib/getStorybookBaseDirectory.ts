import path from 'path';

import { Context } from '../types';

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
    return storybookBaseDir.replace(/^\.[/\\]?/, '');
  }

  const { rootPath } = ctx.git || {};
  if (!rootPath) {
    return '';
  }

  return path.relative(rootPath, '');
}
