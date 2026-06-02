import { LogFunction } from '@cli/log';

import { Task } from '../../../types';
import { TaskRenderer } from '../index';

/**
 * Create a `TaskRenderer` that mirrors task UI state to a log via the injected `logFunction`
 * (e.g. `ctx.log.info`, which also writes to the log file).
 *
 * `start`, `succeed`, and `fail` write the task title followed by its output line; `update` writes
 * only the output line. Consecutive identical output is deduped to reduce spam, especially from
 * a hot `update` loop.
 *
 * @param logFunction The log function (e.g. `ctx.log.info`) to append lines to.
 *
 * @returns A `TaskRenderer` that writes task title and output lines via the log function.
 */
export function logRenderer(logFunction: LogFunction): TaskRenderer {
  let lastData: string | undefined;

  const emitOutput = (state: Task) => {
    if (!state.output || state.output === lastData) return;
    lastData = state.output;
    logFunction(`    → ${state.output}`);
  };

  const emitTitleAndOutput = (state: Task) => {
    logFunction(state.title);
    emitOutput(state);
  };

  return {
    start: emitTitleAndOutput,
    update: emitOutput,
    succeed: emitTitleAndOutput,
    fail: emitTitleAndOutput,
  };
}
