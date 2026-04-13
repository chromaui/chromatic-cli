import { describe, expect, it } from 'vitest';

import TestLogger from '../testLogger';
import { LogOnlyAnalyticsClient } from './logOnly';

describe('LogOnlyAnalyticsClient', () => {
  it('debug-logs tracked events with properties', () => {
    const logger = new TestLogger();
    const client = new LogOnlyAnalyticsClient(logger);

    const properties = { errorCategory: 'storybook_build_failed' };
    client.trackEvent('CLI_STORYBOOK_BUILD_FAILED', properties);

    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('CLI_STORYBOOK_BUILD_FAILED'),
      JSON.stringify(properties)
    );
  });
});
