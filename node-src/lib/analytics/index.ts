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
  const analyticsDisabled = [
    'CHROMATIC_DISABLE_ANALYTICS',
    'CHROMATIC_DISABLE_TELEMETRY',
    'DO_NOT_TRACK',
  ].some((name) => environmentVariableIsTruthy(process.env[name]));

  if (analyticsDisabled) {
    ctx.log.debug('[analytics] disabled via environment variable, using log-only client');
    return new LogOnlyAnalyticsClient(ctx.log);
  }

  ctx.log.debug('[analytics] initializing Index analytics client');
  return new IndexAnalyticsClient({ client: ctx.client, logger: ctx.log });
}

function environmentVariableIsTruthy(envar?: string) {
  return ['1', 'true', 'yes'].includes((envar || '').toLowerCase());
}
