import type { AnalyticsEvent } from '../analytics/events';

/**
 * Boundary over best-effort telemetry. Production callers send events to the
 * Index back end via the GraphQL adapter; tests use the no-op fake (which
 * records events for assertions).
 *
 * Track is intentionally fire-and-forget — implementations must not block
 * the caller. Flush awaits any in-flight events so the CLI can shut down
 * cleanly without dropping telemetry.
 */
export interface Analytics {
  /** Record a single analytics event. */
  track(event: AnalyticsEvent, properties?: Record<string, unknown>): void;
  /** Wait for in-flight events to drain. */
  flush(): Promise<void>;
}
