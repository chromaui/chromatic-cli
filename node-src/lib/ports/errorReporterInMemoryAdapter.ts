import { ErrorReporter, ErrorReporterTagValue } from './errorReporter';

/** A captured `captureException` call. */
export interface RecordedException {
  error: unknown;
  tags?: Record<string, ErrorReporterTagValue>;
}

/** Fixture state backing the in-memory {@link ErrorReporter} adapter. */
export interface InMemoryErrorReporterState {
  /** Exceptions captured in the order they were reported. */
  exceptions?: RecordedException[];
  /** Persistent tags set via `setTag`. */
  tags?: Record<string, ErrorReporterTagValue>;
  /** Persistent contexts set via `setContext`; `null` removes a context. */
  contexts?: Record<string, Record<string, unknown> | null>;
  /** Number of times `flush()` has been called. */
  flushes?: number;
}

/**
 * Construct an in-memory {@link ErrorReporter} backed by canned state. Records
 * every exception/tag/context for assertions and resolves `flush()` immediately.
 *
 * @param state The mutable fixture used to record reports.
 *
 * @returns An ErrorReporter that records calls into the supplied state.
 */
export function createInMemoryErrorReporter(state: InMemoryErrorReporterState = {}): ErrorReporter {
  return {
    captureException(error, tags) {
      state.exceptions = [...(state.exceptions ?? []), { error, tags }];
    },
    setTag(key, value) {
      state.tags = { ...state.tags, [key]: value };
    },
    setContext(name, context) {
      state.contexts = { ...state.contexts, [name]: context };
    },
    async flush() {
      state.flushes = (state.flushes ?? 0) + 1;
      return true;
    },
  };
}
