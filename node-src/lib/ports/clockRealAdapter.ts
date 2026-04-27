import { Clock } from './clock';

/**
 * Construct the production {@link Clock} backed by `Date.now()` and
 * `setTimeout`.
 *
 * @returns A Clock that reads the system clock and schedules real timers.
 */
export function createRealClock(): Clock {
  return {
    now: () => Date.now(),
    since: (startMs: number) => Date.now() - startMs,
    sleep(ms: number, signal?: AbortSignal) {
      if (signal?.aborted) return Promise.reject(signal.reason ?? new Error('Aborted'));
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        }, ms);
        const onAbort = () => {
          clearTimeout(timer);
          reject(signal?.reason ?? new Error('Aborted'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    },
  };
}
