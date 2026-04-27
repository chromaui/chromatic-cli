import { Logger as RawLogger } from '../log';

/**
 * Boundary over the structured logger. Production callers use the adapter that
 * wraps `lib/log.createLogger`; tests use the in-memory adapter (a simple
 * `vi.fn()`-backed recorder that exposes the lines it received).
 *
 * The port type re-uses the existing internal `Logger` interface to avoid a
 * disruptive interface migration. Phase code is encouraged to call
 * `ctx.ports.log.{debug,info,warn,error}` rather than reaching into the
 * lifecycle methods (`queue`, `flush`, `pause`, `resume`, `setLevel`, ...),
 * which remain available for the composition root only.
 */
export type Logger = RawLogger;
