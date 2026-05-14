import { log, spinner } from '@clack/prompts';

import { Context, Task } from '../types';

type Spinner = ReturnType<typeof spinner>;

export type UiState = { title: string; output?: string };

/**
 * Adapter that satisfies the Task interface used by legacy task bodies
 * (they read/write task.title / task.output). Setters forward to the
 * underlying Clack spinner; Clack only has one message slot, so title
 * and output are concatenated with an em dash during the running state.
 */
function createTaskShim(s: Spinner, initialTitle: string): Task {
  let title = initialTitle;
  let output = '';

  const render = () => {
    s.message(output ? `${title} — ${output}` : title);
  };

  return {
    get title() {
      return title;
    },
    set title(value: string) {
      title = value;
      render();
    },
    get output() {
      return output;
    },
    set output(value: string) {
      output = value;
      render();
    },
  };
}

/**
 * Owns one spinner's lifecycle. Body receives a Task-shaped shim it can
 * mutate to drive the spinner message during the run.
 *
 * On success: stops with `final?.title` (or last shim.title), then
 * emits the output as a `log.message` sub-line — mimicking Listr's
 * two-line "title / → output" look using Clack primitives.
 *
 * On error: stops in error state and rethrows.
 */
export async function withSpinner<T>(
  ctx: Context,
  initial: UiState | string,
  body: (task: Task) => Promise<T>,
  final?: UiState | (() => UiState)
): Promise<T> {
  ctx.startedAt = Date.now();
  const initialState = typeof initial === 'string' ? { title: initial } : initial;
  const s = spinner();
  s.start(initialState.title);
  const shim = createTaskShim(s, initialState.title);
  if (initialState.output) shim.output = initialState.output;

  try {
    const result = await body(shim);
    const resolvedFinal = typeof final === 'function' ? final() : final;
    const finalState: UiState = resolvedFinal ?? { title: shim.title, output: shim.output };
    s.stop(finalState.title);
    if (finalState.output) log.message(finalState.output);
    return result;
  } catch (error) {
    s.error(shim.title || initialState.title);
    throw error;
  }
}
