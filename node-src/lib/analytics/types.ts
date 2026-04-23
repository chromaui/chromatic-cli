import type { AnalyticsEvent } from './events';

export interface AnalyticsClient {
  trackEvent(eventName: AnalyticsEvent, properties?: Record<string, unknown>): void;
  shutdown(): Promise<void>;
}
