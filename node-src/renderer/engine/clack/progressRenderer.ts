import { Writable } from 'node:stream';

import { progress as clackProgress, taskLog as clackTaskLog } from '@clack/prompts';

import { Task } from '../../../types';
import { TaskRenderer } from '../index';
import { taskMessageFormatter } from './taskMessageFormatter';
import { wrapTextForClack } from './wrap';

/**
 * Create a Clack `progress`-bar-backed `TaskRenderer`. Used for tasks that report
 * numeric progress via `deps.report({ progress })`.
 *
 * The renderer uses progress/total only to fill the bar. `state.output` is passed unchanged as the label.
 * Typically, this output is formatted by the UI state objects in `ui/tasks/*`.
 *
 * @param output Stream Clack writes to. Defaults to `process.stdout`; the Storybook capture
 * harness injects an in-memory sink instead.
 *
 * @returns A `TaskRenderer` that renders via a Clack progress bar.
 */
export function clackProgressBarRenderer(output?: Writable): TaskRenderer {
  // A task log holds the title as a persistent header above the bar (Clack's progress bar renders
  // the label inline with the bar, so the title can't live there). Closing the task log on
  // succeed/fail collapses the header into the single completion line.
  let taskLog: ReturnType<typeof clackTaskLog>;
  let bar: ReturnType<typeof clackProgress>;
  // Clack's `advance(step)` is relative (`n = min(max, n + step)`), but our progress data is
  // absolute. We normalize to a 0–100 percent and advance by the delta since the last update.
  // Percent (vs. `max=total`) handles `total` being unknown at `start` and changing mid-run, and
  // clamping each percent to [0,100] keeps the fill non-negative, guarding the `repeat(negative)`
  // crash a backwards delta or a negative `progress` would otherwise cause.
  let lastPercent = 0;

  return {
    start: (state: Task) => {
      lastPercent = 0;
      taskLog = clackTaskLog({ title: state.title, spacing: 0, output });
      // `withGuide: false` suppresses the bar's own leading gutter line; otherwise `bar.clear()`
      // orphans it (the bar only erases its own line) and the completion frame gains a stray gutter.
      bar = clackProgress({ output, style: 'heavy', max: 100, withGuide: false });
      bar.start('0%');
    },
    update: (state: Task) => {
      const label = state.output || state.title;
      if (!state.progress) {
        // A textual-only phase update (e.g. "finalizing") — move the label, leave the bar put.
        // `message(label)` is equivalent to `advance(0, label)`.
        bar.message(label);
        return;
      }

      const percent = toPercent(state.progress);
      bar.advance(percent - lastPercent, label);
      lastPercent = percent;
    },
    // `clear()` tears the bar down without writing a completion line, then closing the task log
    // collapses its header and renders the final line.
    succeed: (state: Task) => {
      bar.clear();
      taskLog.success(taskMessageFormatter(state));
    },
    fail: (state: Task) => {
      bar.clear();
      taskLog.error(wrapTextForClack(state.title), { showLog: false });
    },
  };
}

function toPercent({ progress, total }: NonNullable<Task['progress']>): number {
  if (total <= 0) {
    return 0;
  }
  // `Math.max(0, ...)` to ensure we never go negative. `Math.min(100, ...)` to ensure we never go above 100%.
  return Math.max(0, Math.min(100, Math.round((progress / total) * 100)));
}
