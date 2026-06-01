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
 * Close the Clack frame opened by `intro`.
 *
 * @param message Optional message rendered next to the closing glyph.
 */
export const outro = (message?: string): void => {
  clack.outro(message);
};

/**
 * Emit a message with no glyph.
 *
 * @param message The message to display.
 */
export const log = (message: string): void => {
  clack.log.message(wrapTextForClack(message));
};

/**
 * Emit an info-styled message.
 *
 * @param message The message to display.
 */
export const info = (message: string): void => {
  clack.log.info(wrapTextForClack(message));
};

/**
 * Emit a success-styled message.
 *
 * @param message The message to display.
 */
export const success = (message: string): void => {
  clack.log.success(wrapTextForClack(message));
};

/**
 * Emit a warning-styled message.
 *
 * @param message The message to display.
 */
export const warn = (message: string): void => {
  clack.log.warn(wrapTextForClack(message));
};

/**
 * Emit an error-styled message.
 *
 * @param message The message to display.
 */
export const error = (message: string): void => {
  clack.log.error(wrapTextForClack(message));
};

/**
 * Render a boxed message (e.g. for important banners). Auto-wraps content; on failure to render
 * the box (rare; can happen on narrow CI terminals), falls back to a plain log.message.
 *
 * @param message The message to display inside the box.
 * @param options Forwarded to clack.box. Supports `title` to label the box.
 */
export const box = (message: string, options: { title?: string } & clack.BoxOptions = {}): void => {
  const { title, ...rest } = options;
  try {
    clack.box(wrapTextForClack(message), title, { ...rest, width: rest.width ?? 'auto' });
  } catch {
    clack.log.message(wrapTextForClack(message));
  }
};

/**
 * Render a `clack.note` block — a multi-line message inside its own frame. Useful for the final
 * "build URL" callout at the end of a run.
 *
 * @param message The message body.
 * @param title Optional title.
 */
export const note = (message: string, title?: string): void => {
  clack.note(message, title);
};
