import * as clack from '@clack/prompts';

import { wrapTextForClack } from './wrap';

export interface Spinner {
  start: (message: string) => void;
  message: (message: string) => void;
  stop: (message: string) => void;
  error: (message: string) => void;
}

/**
 * Create a thin wrapper around a Clack spinner that wraps multiline messages.
 *
 * @returns A spinner with `start`, `message`, `stop`, and `error` methods.
 */
export function spinner(): Spinner {
  const s = clack.spinner();
  return {
    start: (message: string) => {
      s.start(wrapTextForClack(message));
    },
    message: (message: string) => {
      s.message(wrapTextForClack(message));
    },
    stop: (message: string) => {
      s.stop(wrapTextForClack(message));
    },
    error: (message: string) => {
      s.error(wrapTextForClack(message));
    },
  };
}
