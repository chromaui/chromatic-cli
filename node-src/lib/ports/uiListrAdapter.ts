import { UI, UIProgress, UITaskState } from './ui';

/** Minimal shape of a Listr task wrapper that the adapter writes through. */
interface ListrTaskLike {
  title?: string;
  output?: string;
}

/**
 * Construct the production {@link UI} backed by Listr. The adapter writes
 * `state.title`/`state.output` onto the task wrapper that {@link UI.withTask}
 * activates. Progress events render as `output` strings via the supplied
 * formatter (defaults to `"current/total unit: label"`).
 *
 * @param options Optional overrides.
 * @param options.formatProgress Function used to render `progress(...)` calls.
 *
 * @returns A UI that drives the active Listr task.
 */
export function createListrUI(
  options: {
    formatProgress?: (progress: UIProgress) => string;
  } = {}
): UI {
  const formatProgress =
    options.formatProgress ??
    ((progress) => {
      const unit = progress.unit ? ` ${progress.unit}` : '';
      const label = progress.label ? `: ${progress.label}` : '';
      return `${progress.current}/${progress.total}${unit}${label}`;
    });
  let active: ListrTaskLike | undefined;

  function apply(state: UITaskState | undefined) {
    if (!state || !active) return;
    if (state.title !== undefined) active.title = state.title;
    if (state.output !== undefined) active.output = state.output;
  }

  return {
    taskStart: apply,
    taskUpdate: apply,
    taskSucceed: apply,
    taskFail: apply,
    progress: (progress) => apply({ output: formatProgress(progress) }),
    async withTask(task, fn) {
      const previous = active;
      active = task as ListrTaskLike;
      try {
        return await fn();
      } finally {
        active = previous;
      }
    },
  };
}
