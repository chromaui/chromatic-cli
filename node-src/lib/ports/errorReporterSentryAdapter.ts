import * as Sentry from '@sentry/node';

import { ErrorReporter, ErrorReporterTagValue } from './errorReporter';

/**
 * Construct the production {@link ErrorReporter} backed by `@sentry/node`. The
 * adapter is a thin passthrough so the SDK keeps its own scope/state.
 *
 * @returns An ErrorReporter that forwards to the live Sentry client.
 */
export function createSentryErrorReporter(): ErrorReporter {
  return {
    captureException(error, tags) {
      if (tags) {
        for (const [key, value] of Object.entries(tags)) {
          Sentry.setTag(key, value as ErrorReporterTagValue);
        }
      }
      Sentry.captureException(error);
    },
    setTag(key, value) {
      Sentry.setTag(key, value as any);
    },
    setContext(name, context) {
      Sentry.setContext(name, context as any);
    },
    flush(timeoutMs) {
      return Sentry.flush(timeoutMs);
    },
  };
}
