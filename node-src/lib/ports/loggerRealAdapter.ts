import { Flags, Options } from '../../types';
import { createLogger } from '../log';
import { Logger } from './logger';

/**
 * Construct the production {@link Logger} backed by the existing
 * `lib/log.createLogger`. The adapter is a thin passthrough; the underlying
 * logger already exposes the domain-facing surface.
 *
 * @param flags Optional CLI flags consumed by the underlying logger.
 * @param options Optional resolved options consumed by the underlying logger.
 *
 * @returns A Logger ready to be plumbed through `ctx.ports.log`.
 */
export function createRealLogger(flags?: Flags, options?: Partial<Options>): Logger {
  return createLogger(flags, options);
}
