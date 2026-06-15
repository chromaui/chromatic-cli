import { Task } from '../../../types';
import { CLI_COLORS } from './colors';
import { wrapTextForClack } from './wrap';

/**
 * Format a task message to render the title, plus the muted output on a second
 * line when present. Wrapped to preserve Clack's gutter that runs alongside task logs.
 *
 * @param state The `Task` state.
 *
 * @returns The wrapped title (+ muted output) string.
 */
export function taskMessageFormatter(state: Task) {
  const message = state.output ? state.title + '\n' + CLI_COLORS.muted(state.output) : state.title;
  return wrapTextForClack(message);
}
