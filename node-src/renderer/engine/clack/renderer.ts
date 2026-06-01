import { taskLog as clackTaskLog } from '@clack/prompts';

import { Task } from '../../../types';
import { TaskRenderer } from '../interface';
import { CLI_COLORS } from './colors';
import { error as logError, log as logMessage } from './log';
import { spinner } from './spinner';
import { wrapTextForClack } from './wrap';

/**
 * Create a Clack spinner-backed `TaskRenderer` for a single task. Used for long-running tasks.
 *
 * @returns A `TaskRenderer` that renders via a Clack spinner and the wrapped log primitives.
 */
export function clackSpinnerRenderer(): TaskRenderer {
  const spin = spinner();

  return {
    start: (state: Task) => {
      spin.start(state.title);
      // `pending` transitions often carry a sub-message (e.g. "Connecting to <url>"); surface it
      // as the live spinner message rather than a separate frame line.
      if (state.output) spin.message(state.output);
    },

    update: (state: Task) => {
      spin.message(state.output ?? state.title);
    },

    succeed: (state: Task) => {
      spin.stop(state.title);
      // The success sub-message (e.g. "Using project token '****1234'") reads as a normal log line
      // beneath the stopped spinner.
      if (state.output) logMessage(state.output);
    },

    fail: (state: Task) => {
      spin.error(state.title);
      // Render the error body separately from the failed status line, as the error body might be large.
      if (state.output) logError(state.output);
    },
  };
}

/**
 * Create a Clack task-log-backed `TaskRenderer` for a single task. Used for short-running tasks.
 *
 * @returns A `TaskRenderer` that renders via a Clack task log.
 */
export function clackTaskLogRenderer(): TaskRenderer {
  let taskLog: ReturnType<typeof clackTaskLog>;

  return {
    start: (state: Task) => {
      taskLog = clackTaskLog({ title: state.title });
      if (state.output) taskLog.message(state.output);
    },
    update: (state: Task) => {
      taskLog.message(taskMessageFormatter(state));
    },
    succeed: (state: Task) => {
      taskLog.success(taskMessageFormatter(state));
    },
    fail: (state: Task) => {
      taskLog.error(taskMessageFormatter(state));
    },
  };
}

function taskMessageFormatter(state: Task) {
  const message = state.output ? state.title + '\n' + CLI_COLORS.muted(state.output) : state.title;
  return wrapTextForClack(message);
}
