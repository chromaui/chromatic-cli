import { ChromaticApi } from '../ports/chromaticApi';
import { ErrorReporter } from '../ports/errorReporter';
import { Logger } from '../ports/logger';
import type { AnalyticsEvent } from './events';
import type { AnalyticsClient } from './types';

const SHUTDOWN_TIMEOUT_MS = 5000;

interface IndexAnalyticsOptions {
  chromatic: ChromaticApi;
  logger: Logger;
  errors: ErrorReporter;
}

/** Analytics client that sends events to the Chromatic Index via GraphQL. */
export class IndexAnalyticsClient implements AnalyticsClient {
  private chromatic: ChromaticApi;
  private logger: Logger;
  private errors: ErrorReporter;
  private pending: Promise<unknown>[] = [];

  constructor({ chromatic, logger, errors }: IndexAnalyticsOptions) {
    this.chromatic = chromatic;
    this.logger = logger;
    this.errors = errors;
  }

  trackEvent(eventName: AnalyticsEvent, properties?: Record<string, unknown>): void {
    this.logger.debug(`[analytics] trackEvent: ${eventName}`, JSON.stringify(properties));

    const promise = this.chromatic
      .trackTelemetryEvent({ event: eventName, properties })
      .catch((err) => {
        this.logger.debug('[analytics] trackEvent failed', err);
        this.errors.captureException(err);
      });

    this.pending.push(promise);
  }

  async shutdown(): Promise<void> {
    // Currently no cap on the number of pending events. YAGNI. Will add batching/capping later if it becomes an issue.
    this.logger.debug(`[analytics] shutdown: flushing ${this.pending.length} pending event(s)`);

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timeoutId = setTimeout(() => {
        this.logger.debug('[analytics] shutdown timed out before all events flushed');
        resolve();
      }, SHUTDOWN_TIMEOUT_MS);
    });

    await Promise.race([
      Promise.all(this.pending).then(() => {
        this.logger.debug('[analytics] shutdown: finished flushing pending events');
      }),
      timeout,
    ]);
    if (timeoutId) clearTimeout(timeoutId);
  }
}
