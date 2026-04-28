import { Mock, vi } from 'vitest';

import { Logger } from './logger';

/** Memory-backed logger surface that tests can assert against. */
export interface MemoryLogger extends Logger {
  /** All entries (`debug`/`info`/`warn`/`error`/`log`) in the order they arrived. */
  entries: any[];
  /** Subset of entries logged at `error` level. */
  errors: any[];
  /** Subset of entries logged at `warn` level. */
  warnings: any[];
  error: Mock;
  warn: Mock;
  info: Mock;
  log: Mock;
  debug: Mock;
  file: Mock;
  queue: Mock;
  flush: Mock;
  setLevel: Mock;
  setInteractive: Mock;
  setLogFile: Mock;
  getLevel: Mock;
  pause: Mock;
  resume: Mock;
}

/**
 * Construct an in-memory {@link Logger} backed by `vi.fn()` mocks. Each
 * level's call recorder pushes its arguments into the shared `entries`
 * array (and into the per-level `errors` / `warnings` arrays) so tests can
 * assert ordering or absence without sniffing pino internals.
 *
 * @returns A MemoryLogger ready to be injected through `ctx.ports.log`.
 */
export function createMemoryLogger(): MemoryLogger {
  const entries: any[] = [];
  const errors: any[] = [];
  const warnings: any[] = [];

  const error = vi.fn((...args: any[]) => {
    entries.push(...args);
    errors.push(...args);
  });
  const warn = vi.fn((...args: any[]) => {
    entries.push(...args);
    warnings.push(...args);
  });
  const info = vi.fn((...args: any[]) => entries.push(...args));
  const log = vi.fn((...args: any[]) => entries.push(...args));
  const debug = vi.fn((...args: any[]) => entries.push(...args));

  return {
    entries,
    errors,
    warnings,
    error,
    warn,
    info,
    log,
    debug,
    file: vi.fn(),
    queue: vi.fn(),
    flush: vi.fn(),
    setLevel: vi.fn(),
    setInteractive: vi.fn(),
    setLogFile: vi.fn(),
    getLevel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  };
}
