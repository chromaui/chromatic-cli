import { UI, UIProgress, UITaskState } from './ui';

/** A single recorded UI event, preserving the order in which the adapter received it. */
export type RecordedUIEvent =
  | { type: 'taskStart'; state?: UITaskState }
  | { type: 'taskUpdate'; state: UITaskState }
  | { type: 'taskSucceed'; state?: UITaskState }
  | { type: 'taskFail'; state?: UITaskState }
  | { type: 'progress'; progress: UIProgress };

/** Fixture state backing the in-memory {@link UI} adapter. */
export interface InMemoryUIState {
  /** All emitted events, in order. */
  events?: RecordedUIEvent[];
}

/**
 * Construct an in-memory {@link UI} that records every event for assertions.
 * `withTask` is a passthrough — tests don't need to track the active task.
 *
 * @param state The mutable fixture used to record events.
 *
 * @returns A UI that records events into the supplied state.
 */
export function createInMemoryUI(state: InMemoryUIState = {}): UI {
  const push = (event: RecordedUIEvent) => {
    state.events = [...(state.events ?? []), event];
  };
  return {
    taskStart: (uiState) => push({ type: 'taskStart', state: uiState }),
    taskUpdate: (uiState) => push({ type: 'taskUpdate', state: uiState }),
    taskSucceed: (uiState) => push({ type: 'taskSucceed', state: uiState }),
    taskFail: (uiState) => push({ type: 'taskFail', state: uiState }),
    progress: (progress) => push({ type: 'progress', progress }),
    async withTask(_task, fn) {
      return fn();
    },
  };
}
