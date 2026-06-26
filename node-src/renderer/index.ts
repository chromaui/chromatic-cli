import { Writable } from 'node:stream';

import { Context } from '../types';
import { CLI_COLORS } from './engine/clack/colors';
import { intro as clackIntro, log } from './engine/clack/log';

/**
 * Render the CLI intro frame. Opens the Clack frame with the Chromatic banner and renders the docs
 * link as the first line inside the frame. The frame remains open for the duration of the run; the
 * matching `outro` call closes it.
 *
 * @param ctx The CLI context (or a subset containing `pkg`).
 * @param ctx.pkg The package metadata used to render the version banner and docs link.
 * @param output Stream Clack writes to. Defaults to `process.stdout`; the Storybook capture
 * harness injects an in-memory sink instead.
 */
export function intro({ pkg }: Pick<Context, 'pkg'>, output?: Writable): void {
  clackIntro(`Chromatic CLI v${pkg.version}`, output);
  log(CLI_COLORS.muted(pkg.docs), output);
}
