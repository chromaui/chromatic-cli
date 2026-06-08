import { Writable } from 'node:stream';

import { Context, Task } from '../../types';
import { clackTaskLogRenderer } from '../engine/clack/renderer';
import { intro } from '../index';
import { pkg } from './fixtures';
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
 *
 * @returns The settled ANSI frame.
 */
export function captureTask(state: Task): string {
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
    drive(clackTaskLogRenderer(sink), state);
  } finally {
    process.stdout.columns = previousColumns;
    // `process.env.CI = undefined` would coerce to the string "undefined" (truthy), so unset
    // explicitly when CI was absent to start with.
    if (previousCI === undefined) delete process.env.CI;
    else process.env.CI = previousCI;
  }

  return settle(read());
}

function drive(renderer: ReturnType<typeof clackTaskLogRenderer>, state: Task): void {
  // clack's taskLog requires starting before rendering success/error hooks, so we call `start`
  // first on success/error hooks
  switch (state.status) {
    case 'pending': {
      renderer.start(state);
      return;
    }
    case 'success': {
      renderer.start({ title: state.title });
      renderer.succeed(state);
      return;
    }
    case 'error': {
      renderer.start({ title: state.title });
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
