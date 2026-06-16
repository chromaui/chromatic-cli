type IntervalCallback = () => void;

/**
 * Run `drive` with `setInterval` stubbed so Clack's animated renderers (`progress`, `spinner`)
 * render exactly one deterministic frame synchronously.
 *
 * Clack draws an animated frame only inside the `setInterval` callback it schedules on `start`;
 * `start`/`advance`/`message` set state but don't write. `captureTask`'s drive is synchronous and
 * `await`-free, so a real interval would never fire and the in-progress capture would be blank.
 * Instead we collect each scheduled callback and fire every still-live one once after `drive`
 * returns. Callbacks Clack already cleared (a `stop`/`error` ran during `drive`) become no-ops,
 * so terminal-state captures fire nothing.
 *
 * Operates in plain Node (the `?clack` plugin runs frames via jiti, not vitest), so it swaps the
 * real globals rather than reaching for `vi.useFakeTimers`. The swap is safe because `drive` is
 * synchronous — no other code interleaves between the swap and the restore.
 *
 * @param drive The synchronous capture drive to run.
 *
 * @returns Whatever `drive` returns.
 */
export function withOneTick<T>(drive: () => T): T {
  const registered: IntervalCallback[] = [];
  const realSetInterval = globalThis.setInterval;
  const realClearInterval = globalThis.clearInterval;

  globalThis.setInterval = ((callback: IntervalCallback) =>
    registered.push(callback)) as typeof setInterval;

  // The real `setInterval` returns the 1-based registration index as its "timer id".
  // Our mock `clearInterval` takes that number and modifies the `registered` callback
  // array to turn the registered callback into a noop, effectively clearing it.
  globalThis.clearInterval = ((id: number) => {
    if (registered[id - 1]) {
      registered[id - 1] = () => {};
    }
  }) as typeof clearInterval;

  try {
    const result = drive();
    for (const callback of registered) {
      callback();
    }
    return result;
  } finally {
    globalThis.setInterval = realSetInterval;
    globalThis.clearInterval = realClearInterval;
  }
}
