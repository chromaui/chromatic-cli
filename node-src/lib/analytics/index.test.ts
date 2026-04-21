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
  });

  it('returns an Index client when CHROMATIC_DISABLE_ANALYTICS is not set', () => {
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
});
