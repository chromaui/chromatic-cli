import * as clack from '@clack/prompts';

import { wrapTextForClack } from './wrap';

/**
 * Render the opening Clack frame. Any subsequent log/spinner/note calls render inside the frame
 * until `outro` closes it.
 *
 * @param message Title for the frame; rendered next to the open glyph.
 */
export const intro = (message: string): void => {
  clack.intro(message);
};

/**
 * Emit a message with no glyph.
 *
 * @param message The message to display.
 */
export const log = (message: string): void => {
  clack.log.message(wrapTextForClack(message));
};
