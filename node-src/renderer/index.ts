import chalk from 'chalk';

import { Context } from '../types';
import { intro as clackIntro, log } from './engine/clack/log';

/**
 * Render the CLI intro frame. Opens the Clack frame with the product banner and renders the docs
 * link as the first line inside the frame. The frame remains open for the duration of the run; the
 * matching `outro` call closes it.
 *
 * @param ctx The CLI context (or a subset containing `pkg`).
 * @param ctx.pkg The package metadata used to render the version banner and docs link.
 */
export function intro({ pkg }: Pick<Context, 'pkg'>): void {
  clackIntro(chalk.bold(`Chromatic CLI v${pkg.version}`));
  log(chalk.dim(pkg.docs));
}
