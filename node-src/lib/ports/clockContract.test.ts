import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Clock } from './clock';
import { createManualClock, ManualClock } from './clockManualAdapter';
import { createRealClock } from './clockRealAdapter';

interface AdapterSetup {
  adapter: Clock;
  /** Advance "wall" time by ms. For real adapter this is via fake timers; for manual it's `tick`. */
  advance: (ms: number) => Promise<void>;
  /** Force a specific `now()` value. */
  setTime: (ms: number) => void;
}

function realSetup(): AdapterSetup {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(0));
  return {
    adapter: createRealClock(),
    advance: async (ms) => {
      await vi.advanceTimersByTimeAsync(ms);
    },
    setTime: (ms) => vi.setSystemTime(new Date(ms)),
  };
}

function manualSetup(): AdapterSetup {
  const clock: ManualClock = createManualClock(0);
  return {
    adapter: clock,
    advance: async (ms) => clock.tick(ms),
    setTime: (ms) => clock.setNow(ms),
  };
}

const adapters = [
  ['real', realSetup],
  ['manual', manualSetup],
] as const;

describe.each(adapters)('Clock (%s)', (name, makeSetup) => {
  afterEach(() => {
    if (name === 'real') vi.useRealTimers();
  });

  it('reports the current time', () => {
    const { adapter, setTime } = makeSetup();
    setTime(1234);
    expect(adapter.now()).toBe(1234);
  });

  it('reports elapsed time since a start', () => {
    const { adapter, setTime } = makeSetup();
    setTime(1000);
    const start = adapter.now();
    setTime(1700);
    expect(adapter.since(start)).toBe(700);
  });

  it('resolves a sleep after the specified delay', async () => {
    const { adapter, advance } = makeSetup();
    let resolved = false;
    const promise = adapter.sleep(500).then(() => {
      resolved = true;
    });
    expect(resolved).toBe(false);
    await advance(500);
    await promise;
    expect(resolved).toBe(true);
  });

  it('rejects sleep when the abort signal fires', async () => {
    const { adapter } = makeSetup();
    const controller = new AbortController();
    const promise = adapter.sleep(10_000, controller.signal);
    controller.abort(new Error('cancelled'));
    await expect(promise).rejects.toThrow(/cancelled/);
  });
});
