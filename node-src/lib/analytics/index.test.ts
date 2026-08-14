import { afterEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../testLogger';
import { createAnalyticsClient } from './index';
import { IndexAnalyticsClient } from './indexClient';
import { LogOnlyAnalyticsClient } from './logOnly';

function makeContext() {
  return {
    log: new TestLogger(),
    client: { runQuery: vi.fn() },
  } as any;
}

describe('createAnalyticsClient', () => {
  afterEach(() => {
    delete process.env.CHROMATIC_DISABLE_ANALYTICS;
    delete process.env.CHROMATIC_DISABLE_TELEMETRY;
    delete process.env.DO_NOT_TRACK;
  });

  it('returns an Index client when no disabling environment variable is not set', () => {
    const ctx = makeContext();
    const client = createAnalyticsClient(ctx);
    expect(client).toBeInstanceOf(IndexAnalyticsClient);
  });

  it('returns a log-only client when CHROMATIC_DISABLE_ANALYTICS is set', () => {
    process.env.CHROMATIC_DISABLE_ANALYTICS = 'true';
    const ctx = makeContext();
    const client = createAnalyticsClient(ctx);
    expect(client).toBeInstanceOf(LogOnlyAnalyticsClient);
  });

  it('returns a log-only client when CHROMATIC_DISABLE_TELEMETRY is set', () => {
    process.env.CHROMATIC_DISABLE_TELEMETRY = '1';
    const ctx = makeContext();
    const client = createAnalyticsClient(ctx);
    expect(client).toBeInstanceOf(LogOnlyAnalyticsClient);
  });

  it('returns a log-only client when DO_NOT_TRACK is set', () => {
    process.env.DO_NOT_TRACK = 'YES';
    const ctx = makeContext();
    const client = createAnalyticsClient(ctx);
    expect(client).toBeInstanceOf(LogOnlyAnalyticsClient);
  });
});
