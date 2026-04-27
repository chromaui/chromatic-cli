import type { AnalyticsEvent } from '../analytics/events';
import { Analytics } from './analytics';

/** A captured analytics event. */
export interface RecordedAnalyticsEvent {
  event: AnalyticsEvent;
  properties?: Record<string, unknown>;
}

/** Fixture state backing the in-memory {@link Analytics} adapter. */
export interface InMemoryAnalyticsState {
  /** Events captured in the order they were tracked. */
  events?: RecordedAnalyticsEvent[];
  /** Number of times `flush()` has been called. */
  flushes?: number;
}

/**
 * Construct an in-memory {@link Analytics} that records every event for test
 * assertions. `flush()` resolves immediately and increments a counter so tests
 * can verify shutdown ordering.
 *
 * @param state The mutable fixture used to record events and flush calls.
 *
 * @returns An Analytics that records events into the supplied state.
 */
export function createInMemoryAnalytics(state: InMemoryAnalyticsState = {}): Analytics {
  return {
    track(event, properties) {
      state.events = [...(state.events ?? []), { event, properties }];
    },
    async flush() {
      state.flushes = (state.flushes ?? 0) + 1;
    },
  };
}
