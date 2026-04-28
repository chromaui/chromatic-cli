import type { AnalyticsClient } from '../analytics/types';
import { Analytics } from './analytics';

/**
 * Construct the production {@link Analytics} backed by the existing
 * `AnalyticsClient` (Segment-style). The adapter renames `trackEvent`/
 * `shutdown` onto the smaller `track`/`flush` surface.
 *
 * @param client The underlying analytics client to delegate to.
 *
 * @returns An Analytics that forwards events and flushes via shutdown.
 */
export function createRealAnalytics(client: AnalyticsClient): Analytics {
  return {
    track: (event, properties) => client.trackEvent(event, properties),
    flush: () => client.shutdown(),
  };
}
