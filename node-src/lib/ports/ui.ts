/** State broadcast to the UI when a task transitions. */
export interface UITaskState {
  /** Updated task title (header line). */
  title?: string;
  /** Updated task output (sub-line / progress detail). */
  output?: string;
}

/** Snapshot of a long-running operation's progress. */
export interface UIProgress {
  /** Items processed so far. */
  current: number;
  /** Total items expected. */
  total: number;
  /** Unit label (e.g. `'snapshots'`, `'files'`). */
  unit?: string;
  /** Optional human-readable label, e.g. the active item's name. */
  label?: string;
}

/**
 * Boundary over the user-visible task UI. Production callers use the Listr
 * adapter (CLI) or the GitHub-annotations adapter (Action); tests use the
 * no-op fake.
 *
 * The phase code emits semantic events; the adapter decides how to render
 * them. The "current task" implicit in `taskUpdate`/`taskSucceed`/`taskFail`
 * is set by the adapter — for Listr that's the active `ListrTaskWrapper`,
 * scoped via {@link UI.withTask}.
 */
export interface UI {
  /** Mark a task as started; useful for renderers that show start times. */
  taskStart(state?: UITaskState): void;
  /** Update the active task's title/output mid-flight. */
  taskUpdate(state: UITaskState): void;
  /** Mark the active task as succeeded; the renderer commits the final title. */
  taskSucceed(state?: UITaskState): void;
  /** Mark the active task as failed. */
  taskFail(state?: UITaskState): void;
  /** Report progress against a long-running operation inside the active task. */
  progress(progress: UIProgress): void;
  /**
   * Run `fn` with `task` set as the active task on the adapter. The adapter
   * restores the previous active task when the promise settles. Adapters that
   * don't track a "current" task may treat this as a no-op passthrough.
   */
  withTask<T>(task: unknown, fn: () => Promise<T>): Promise<T>;
}
