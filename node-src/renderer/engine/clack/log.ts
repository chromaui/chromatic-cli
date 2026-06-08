import { Writable } from 'node:stream';

import * as clack from '@clack/prompts';

import { wrapTextForClack } from './wrap';

/**
 * Render the opening Clack frame. Any subsequent log/spinner/note calls render inside the frame
 * until `outro` closes it.
 *
 * @param message Title for the frame; rendered next to the open glyph.
 * @param output Stream Clack writes to. Defaults to `process.stdout`; the Storybook capture
 * harness injects an in-memory sink instead.
 */
export const intro = (message: string, output?: Writable): void => {
  clack.intro(message, { output });
};

/**
 * Emit a message with no glyph.
 *
 * @param message The message to display.
 * @param output Stream Clack writes to. Defaults to `process.stdout`; the Storybook capture
 * harness injects an in-memory sink instead.
 */
export const log = (message: string, output?: Writable): void => {
  clack.log.message(wrapTextForClack(message), { output });
};
