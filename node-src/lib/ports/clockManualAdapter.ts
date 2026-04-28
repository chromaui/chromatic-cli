import { Clock } from './clock';

interface PendingSleep {
  fireAt: number;
  resolve: () => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

/** Manually-advanced {@link Clock} returned alongside a `tick` helper. */
export interface ManualClock extends Clock {
  /** Advance the clock by `ms` milliseconds, firing any pending sleeps that have come due. */
  tick(ms: number): void;
  /** Set the clock to an absolute timestamp. Pending sleeps that have come due fire. */
  setNow(ms: number): void;
  /** Number of sleeps still pending. Useful for assertions. */
  readonly pending: number;
}

/**
 * Construct a manually-advanced {@link Clock} suitable for unit tests. Sleeps
 * are queued and only resolve when {@link ManualClock.tick} or
 * {@link ManualClock.setNow} advances the clock past their fire time.
 *
 * @param startMs The initial value of `now()`. Defaults to `0`.
 *
 * @returns A Clock whose internal time is caller-controlled.
 */
export function createManualClock(startMs = 0): ManualClock {
  let current = startMs;
  const pending: PendingSleep[] = [];

  function flush() {
    for (let index = 0; index < pending.length; index++) {
      const entry = pending[index];
      if (entry.fireAt > current) continue;
      pending.splice(index, 1);
      index--;
      if (entry.signal && entry.onAbort) {
        entry.signal.removeEventListener('abort', entry.onAbort);
      }
      entry.resolve();
    }
  }

  return {
    now: () => current,
    since: (startMsArgument: number) => current - startMsArgument,
    sleep(ms: number, signal?: AbortSignal) {
      if (signal?.aborted) return Promise.reject(signal.reason ?? new Error('Aborted'));
      return new Promise<void>((resolve, reject) => {
        const entry: PendingSleep = { fireAt: current + ms, resolve, reject, signal };
        if (signal) {
          entry.onAbort = () => {
            const index = pending.indexOf(entry);
            if (index !== -1) pending.splice(index, 1);
            reject(signal.reason ?? new Error('Aborted'));
          };
          signal.addEventListener('abort', entry.onAbort, { once: true });
        }
        pending.push(entry);
        if (ms <= 0) flush();
      });
    },
    tick(ms: number) {
      current += ms;
      flush();
    },
    setNow(ms: number) {
      current = ms;
      flush();
    },
    get pending() {
      return pending.length;
    },
  };
}
