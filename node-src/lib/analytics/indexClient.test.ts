import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createInMemoryErrorReporter } from '../ports/errorReporterInMemoryAdapter';
import TestLogger from '../testLogger';
import { AnalyticsEvent } from './events';
import { IndexAnalyticsClient } from './indexClient';

function makeClient(trackTelemetryEvent = vi.fn().mockResolvedValue(undefined)) {
  const chromatic = { trackTelemetryEvent } as any;
  const logger = new TestLogger();
  const errorsState = {} as any;
  const errors = createInMemoryErrorReporter(errorsState);
  const client = new IndexAnalyticsClient({ chromatic, logger, errors });
  return { client, chromatic, logger, errors, errorsState, trackTelemetryEvent };
}

describe('IndexAnalyticsClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('trackEvent', () => {
    it('forwards event + properties to the ChromaticApi port', () => {
      const { client, trackTelemetryEvent } = makeClient();

      client.trackEvent(AnalyticsEvent.CLI_STORYBOOK_BUILD_FAILED, {
        errorCategory: 'storybook_build_failed',
      });

      expect(trackTelemetryEvent).toHaveBeenCalledWith({
        event: AnalyticsEvent.CLI_STORYBOOK_BUILD_FAILED,
        properties: { errorCategory: 'storybook_build_failed' },
      });
    });

    it('swallows GQL errors and reports through the ErrorReporter port', async () => {
      const error = new Error('GQL failed');
      const { client, errorsState } = makeClient(vi.fn().mockRejectedValue(error));

      expect(() => client.trackEvent(AnalyticsEvent.CLI_STORYBOOK_BUILD_FAILED, {})).not.toThrow();

      await client.shutdown();

      expect(errorsState.exceptions).toEqual([{ error, tags: undefined }]);
    });
  });

  describe('shutdown', () => {
    it('awaits all pending in-flight requests', async () => {
      const resolvers: (() => void)[] = [];
      const runQuery = vi.fn(
        () =>
          new Promise((resolve) => {
            resolvers.push(() => resolve({ trackEvent: { success: true } }));
          })
      );
      const { client } = makeClient(runQuery);

      client.trackEvent(AnalyticsEvent.CLI_STORYBOOK_BUILD_FAILED, {});
      client.trackEvent(AnalyticsEvent.CLI_STORYBOOK_BUILD_FAILED, {});

      let resolved = false;
      const shutdownPromise = client.shutdown().then(() => {
        resolved = true;
      });

      // Task flush: force `.then(() => resolved = true)` above to fire if `shutdown` has returned already resolved promise
      await Promise.resolve();
      expect(resolved).toBe(false);

      for (const resolve of resolvers) resolve();
      await shutdownPromise;
      expect(resolved).toBe(true);
    });

    it('times out after 5s when requests hang', async () => {
      vi.useFakeTimers();
      try {
        const runQuery = vi.fn(() => new Promise(() => {}));
        const { client, logger } = makeClient(runQuery);

        client.trackEvent(AnalyticsEvent.CLI_STORYBOOK_BUILD_FAILED, {});

        const shutdownPromise = client.shutdown();
        vi.advanceTimersByTime(5000);
        await shutdownPromise;
        expect(logger.debug).toHaveBeenCalledWith(
          '[analytics] shutdown timed out before all events flushed'
        );
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
