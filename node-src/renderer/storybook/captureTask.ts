import { Writable } from 'node:stream';

import { Context, Task } from '../../types';
import { TaskRenderer } from '../engine';
import { clackTaskLogRenderer } from '../engine/clack/taskLogRenderer';
import { intro } from '../index';
import { pkg } from './fixtures';
import { withOneTick } from './oneTick';
import { settle } from './settle';

// `wrap.ts` reads `process.stdout.columns` directly (independent of the sink), so line wrapping must
// be pinned per capture for deterministic output. 80 matches the sink width and `MAX_OPTIMAL_WIDTH`.
const CAPTURE_WIDTH = 80;

/**
 * Capture the real Clack renderer's output for a single task state, as a settled ANSI frame.
 *
 * Drives `renderer/index.ts`'s `intro` and `clackTaskLogRenderer` against an in-memory TTY sink, so
 * Storybook depicts exactly what users see at the terminal. No `outro` is emitted: a mid-pipeline
 * task leaves the frame open.
 *
 * @param state The `Task` state to render (`pending`, `success`, or `error`).
 * @param startingState The `Task` to render as the initial state. `success` and `error` tasks
 * overwrite the starting state, but the `update` task inherits the starting state's title.
 * Defaults to a generic "Starting task..." state.
 * @param makeRenderer Factory for the renderer to drive. Defaults to `clackTaskLogRenderer`;
 * animated renderers (e.g. `clackProgressBarRenderer`) pass their own factory.
 *
 * @returns The settled ANSI frame.
 */
export function captureTask(
  state: Task,
  startingState?: Task,
  makeRenderer: (sink: Writable) => TaskRenderer = clackTaskLogRenderer
): string {
  const { sink, read } = createSink();

  // Clack drops transient `.message()` output in non-TTY mode, gated on `process.env.CI === 'true'`.
  // Storybook is built in CI, so unset it during the sync `drive` call to force TTY rendering.
  // The window is `await`-free, so the reset is atomic even if Vite `load` hooks overlap.
  const previousCI = process.env.CI;
  const previousColumns = process.stdout.columns;
  process.env.CI = '';
  process.stdout.columns = CAPTURE_WIDTH;
  try {
    intro({ pkg } as Pick<Context, 'pkg'>, sink);
    // Fire animated renderers' interval once inside the same sync window, so a single bar/spinner
    // frame is captured deterministically (no real timer ever fires in this await-free drive).
    withOneTick(() => drive(makeRenderer(sink), state, startingState));
  } finally {
    process.stdout.columns = previousColumns;
    // `process.env.CI = undefined` would coerce to the string "undefined" (truthy), so unset
    // explicitly when CI was absent to start with.
    if (previousCI === undefined) delete process.env.CI;
    else process.env.CI = previousCI;
  }

  return settle(read());
}

function drive(renderer: TaskRenderer, state: Task, startingState?: Task): void {
  if (!startingState) {
    startingState = {
      status: 'pending',
      title: 'Generic starting state',
      output: 'Starting task...',
    };
  }
  // clack's taskLog requires starting before rendering success/error hooks, so we call `start`
  // first on success/error hooks
  switch (state.status) {
    case 'pending': {
      renderer.start(state);
      return;
    }
    case 'updating': {
      renderer.start(startingState);
      renderer.update(state);
      return;
    }
    case 'success': {
      renderer.start(startingState);
      renderer.succeed(state);
      return;
    }
    case 'error': {
      renderer.start(startingState);
      renderer.fail(state);
      return;
    }
    default: {
      // 'initial' / undefined: no migrated story produces these; Clack has no faithful rendering.
      return;
    }
  }
}

function createSink(): { sink: Writable; read: () => string } {
  let buffer = '';
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      buffer += chunk.toString();
      callback();
    },
  });

  // Clack's `isTTY(output)` checks `output.isTTY === true`; `getColumns(output)` reads
  // `output.columns`. Flag the sink as an 80-column TTY so Clack renders the interactive path.
  Object.assign(sink, { isTTY: true, columns: CAPTURE_WIDTH, rows: 30 });

  return { sink, read: () => buffer };
}
