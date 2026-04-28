import { afterEach, describe, expect, it, vi } from 'vitest';

import { AnalyticsEvent } from '../analytics/events';
import type { AnalyticsClient } from '../analytics/types';
import type { Analytics } from './analytics';
import {
  createInMemoryAnalytics,
  InMemoryAnalyticsState,
  RecordedAnalyticsEvent,
} from './analyticsInMemoryAdapter';
import { createRealAnalytics } from './analyticsRealAdapter';

interface AdapterSetup {
  adapter: Analytics;
  recorded: () => RecordedAnalyticsEvent[];
  flushCount: () => number;
}

function realSetup(): AdapterSetup {
  const events: RecordedAnalyticsEvent[] = [];
  let flushes = 0;
  const client: AnalyticsClient = {
    trackEvent: vi.fn((event, properties) => {
      events.push({ event, properties });
    }),
    shutdown: vi.fn(async () => {
      flushes += 1;
    }),
  };
  return {
    adapter: createRealAnalytics(client),
    recorded: () => events,
    flushCount: () => flushes,
  };
}

function inMemorySetup(): AdapterSetup {
  const state: InMemoryAnalyticsState = {};
  return {
    adapter: createInMemoryAnalytics(state),
    recorded: () => state.events ?? [],
    flushCount: () => state.flushes ?? 0,
  };
}

const adapters = [
  ['real', realSetup],
  ['in-memory', inMemorySetup],
] as const;

describe.each(adapters)('Analytics (%s)', (_name, makeSetup) => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('records each tracked event in order', () => {
    const { adapter, recorded } = makeSetup();
    adapter.track(AnalyticsEvent.CLI_STORYBOOK_BUILD_FAILED, { errorCategory: 'a' });
    adapter.track(AnalyticsEvent.CLI_STORYBOOK_BUILD_FAILED, { errorCategory: 'b' });
    expect(recorded()).toEqual([
      {
        event: AnalyticsEvent.CLI_STORYBOOK_BUILD_FAILED,
        properties: { errorCategory: 'a' },
      },
      {
        event: AnalyticsEvent.CLI_STORYBOOK_BUILD_FAILED,
        properties: { errorCategory: 'b' },
      },
    ]);
  });

  it('flushes pending events on demand', async () => {
    const { adapter, flushCount } = makeSetup();
    expect(flushCount()).toBe(0);
    await adapter.flush();
    expect(flushCount()).toBe(1);
  });
});
