export interface AnalyticsClient {
  trackEvent(eventName: string, properties?: Record<string, unknown>): void;
  shutdown(): Promise<void>;
}
