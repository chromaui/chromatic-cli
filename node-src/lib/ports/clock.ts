/**
 * Boundary over the system clock and `setTimeout`. The domain calls into this
 * port whenever it needs the current time or wants to schedule work. Production
 * uses the real adapter that delegates to `Date.now()` / `setTimeout`; tests
 * use the manual adapter that exposes deterministic time advancement.
 */
export interface Clock {
  /** Milliseconds since the epoch — the clock's view of "now". */
  now(): number;
  /** Convenience for `now() - startMs`. Returns elapsed milliseconds since the supplied start time. */
  since(startMs: number): number;
  /**
   * Resolve after the supplied delay. Aborts immediately if the signal is
   * already aborted, and rejects on later abort.
   */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}
