import { Context } from '../../types';
import { IndexAnalyticsClient } from './indexClient';
import { LogOnlyAnalyticsClient } from './logOnly';
import type { AnalyticsClient } from './types';

export type { AnalyticsClient } from './types';

/**
 * Creates an analytics client.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns An analytics client instance.
 */
export function createAnalyticsClient(ctx: Context): AnalyticsClient {
  if (process.env.CHROMATIC_DISABLE_ANALYTICS === 'true') {
    ctx.log.debug('[analytics] disabled via CHROMATIC_DISABLE_ANALYTICS, using log-only client');
    return new LogOnlyAnalyticsClient(ctx.log);
  }

  ctx.log.debug('[analytics] initializing Index analytics client');
  return new IndexAnalyticsClient({
    chromatic: ctx.ports.chromatic,
    logger: ctx.log,
    errors: ctx.ports.errors,
  });
}
