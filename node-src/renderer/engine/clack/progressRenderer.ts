import { Writable } from 'node:stream';

import { log as clackLog, progress as clackProgress } from '@clack/prompts';

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
      bar = clackProgress({ output, style: 'heavy', max: 100 });
      bar.start(state.title);
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
    // Clack's `bar.stop`/`error` write their own terminal line with a hardcoded hollow `◇` and no
    // per-line gutter, so a multi-line message diverges from the taskLog-backed tasks (filled `◆`
    // + `│  ` gutter). `clear()` tears the bar down without writing anything, so the completed line
    // can go through `clack.log.*` — the same path `clackTaskLogRenderer` uses — for an identical
    // frame. `spacing: 0` because the bar's lifecycle already emits the leading blank gutter line.
    succeed: (state: Task) => {
      bar.clear();
      clackLog.success(taskMessageFormatter(state), { output, spacing: 0 });
    },
    fail: (state: Task) => {
      bar.clear();
      clackLog.error(wrapTextForClack(state.title), { output, spacing: 0 });
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
