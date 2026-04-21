import * as Sentry from '@sentry/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../testLogger';
import { IndexAnalyticsClient } from './indexClient';

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
}));

function makeClient(runQuery = vi.fn().mockResolvedValue({ trackEvent: { success: true } })) {
  const gqlClient = { runQuery } as any;
  const logger = new TestLogger();
  const client = new IndexAnalyticsClient({ client: gqlClient, logger });
  return { client, gqlClient, logger, runQuery };
}

describe('IndexAnalyticsClient', () => {
  beforeEach(() => {
    vi.mocked(Sentry.captureException).mockClear();
  });

  describe('trackEvent', () => {
    it('calls runQuery with TrackCLITelemetryEvent mutation and input built from properties', () => {
      const { client, runQuery } = makeClient();

      client.trackEvent('CLI_STORYBOOK_BUILD_FAILED', {
        errorCategory: 'storybook_build_failed',
      });

      expect(runQuery).toHaveBeenCalledWith(
        expect.stringMatching(/TrackCLITelemetryEvent/),
        {
          input: {
            event: 'CLI_STORYBOOK_BUILD_FAILED',
            properties: { errorCategory: 'storybook_build_failed' },
          },
        },
        { retries: 0 }
      );
    });

    it('swallows GQL errors and reports to Sentry', async () => {
      const error = new Error('GQL failed');
      const { client } = makeClient(vi.fn().mockRejectedValue(error));

      expect(() => client.trackEvent('some-event', {})).not.toThrow();

      await client.shutdown();

      expect(Sentry.captureException).toHaveBeenCalledWith(error);
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

      client.trackEvent('event-1', {});
      client.trackEvent('event-2', {});

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

        client.trackEvent('event-1', {});

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
