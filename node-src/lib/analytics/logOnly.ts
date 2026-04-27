import { Logger } from '../ports/logger';
import type { AnalyticsEvent } from './events';
import type { AnalyticsClient } from './types';

/** Analytics client that debug-logs events. */
export class LogOnlyAnalyticsClient implements AnalyticsClient {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  trackEvent(eventName: AnalyticsEvent, properties?: Record<string, unknown>): void {
    this.logger.debug(`[analytics] trackEvent: ${eventName}`, JSON.stringify(properties));
  }

  async shutdown(): Promise<void> {
    this.logger.debug('[analytics] shutdown');
  }
}
