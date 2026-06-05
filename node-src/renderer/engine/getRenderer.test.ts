import { describe, expect, it, vi } from 'vitest';

import { Context, Task } from '../../types';
import { getRenderer } from './getRenderer';
import { TaskRenderer } from './index';

/**
 * Build a minimal `ctx` for `getRenderer`, capturing the lines written to each log channel.
 *
 * @param interactive Whether the run is interactive.
 *
 * @returns The `ctx` slice plus the `file` and `info` channel sinks.
 */
function buildContext(interactive: boolean) {
  const file: unknown[][] = [];
  const info: unknown[][] = [];
  const ctx = {
    options: { interactive },
    log: {
      file: (...args: unknown[]) => file.push(args),
      info: (...args: unknown[]) => info.push(args),
    },
  } as unknown as Pick<Context, 'options' | 'log'>;
  return { ctx, file, info };
}

/**
 * Build a `TaskRenderer` whose four hooks are spies.
 *
 * @returns A `TaskRenderer` with `vi.fn()` hooks.
 */
function spyRenderer(): TaskRenderer {
  return { start: vi.fn(), update: vi.fn(), succeed: vi.fn(), fail: vi.fn() };
}

const task: Task = { status: 'pending', title: 'Authenticating', output: 'working...' };

describe('getRenderer', () => {
  it('drives the interactive renderer on interactive runs', () => {
    const { ctx } = buildContext(true);
    const interactive = spyRenderer();

    const renderer = getRenderer(ctx, () => interactive);
    renderer.start(task);

    expect(interactive.start).toHaveBeenCalledWith(task);
  });

  it('does not construct the interactive renderer on non-interactive runs', () => {
    const { ctx } = buildContext(false);
    const makeInteractiveRenderer = vi.fn(spyRenderer);

    getRenderer(ctx, makeInteractiveRenderer);

    expect(makeInteractiveRenderer).not.toHaveBeenCalled();
  });

  it('writes to the info channel on non-interactive runs', () => {
    const { ctx, info, file } = buildContext(false);

    const renderer = getRenderer(ctx, spyRenderer);
    renderer.start(task);

    expect(info).toEqual([['Authenticating'], ['    → working...']]);
    expect(file).toEqual([]); // reminder: the logger handles fanout to file, not the renderer
  });

  it('mirrors to the file channel alongside the interactive renderer on interactive runs', () => {
    const { ctx, file, info } = buildContext(true);
    const interactive = spyRenderer();

    const renderer = getRenderer(ctx, () => interactive);
    renderer.start(task);

    expect(interactive.start).toHaveBeenCalledWith(task);
    expect(file).toEqual([['Authenticating'], ['    → working...']]);
    expect(info).toEqual([]);
  });

  it('reports a throwing interactive renderer to the file channel rather than crashing', () => {
    const { ctx, file } = buildContext(true);
    const interactive: TaskRenderer = {
      ...spyRenderer(),
      start: () => {
        throw new Error('boom');
      },
    };

    const renderer = getRenderer(ctx, () => interactive);

    expect(() => renderer.start(task)).not.toThrow();
    expect(file.some(([message]) => message === 'renderer start hook threw')).toBe(true);
  });
});
