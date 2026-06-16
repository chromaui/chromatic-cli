import { Writable } from 'node:stream';

import { log as clackLog, spinner as clackSpinner } from '@clack/prompts';

import { Task } from '../../../types';
import { TaskRenderer } from '../index';
import { taskMessageFormatter } from './taskMessageFormatter';
import { wrapTextForClack } from './wrap';

/**
 * Create a Clack `spinner`-backed `TaskRenderer`. Used for liveness-only tasks that report textual
 * updates but no numeric progress (e.g. build, verify).
 *
 * @param output Stream Clack writes to. Defaults to `process.stdout`; the Storybook capture
 * harness injects an in-memory sink instead.
 *
 * @returns A `TaskRenderer` that renders via a Clack spinner.
 */
export function clackSpinnerRenderer(output?: Writable): TaskRenderer {
  let spinner: ReturnType<typeof clackSpinner>;

  return {
    start: (state: Task) => {
      spinner = clackSpinner({ output });
      spinner.start(state.title);
    },
    update: (state: Task) => {
      spinner.message(wrapTextForClack(state.output || state.title));
    },
    // Clack's `spinner.stop`/`error` write their own terminal line with a hardcoded hollow `◇` and
    // no per-line gutter, so a multi-line message diverges from the taskLog-backed tasks (filled `◆`
    // + `│  ` gutter). `clear()` tears the spinner down without writing anything, so the completed
    // line can go through `clack.log.*` — the same path `clackTaskLogRenderer` uses — for an
    // identical frame. `spacing: 0` because the spinner's lifecycle already emits the leading blank
    // gutter line.
    succeed: (state: Task) => {
      spinner.clear();
      clackLog.success(taskMessageFormatter(state), { output, spacing: 0 });
    },
    fail: (state: Task) => {
      spinner.clear();
      clackLog.error(wrapTextForClack(state.title), { output, spacing: 0 });
    },
  };
}
