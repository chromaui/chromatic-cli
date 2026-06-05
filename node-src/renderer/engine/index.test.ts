import { describe, expect, it, vi } from 'vitest';

import { Context, Task } from '../../types';
import { runTask, TaskConfig, TaskRenderer } from './index';

/**
 * A `TaskRenderer` implementation that records the `Task` state objects passed to each lifecycle hook.
 *
 * @returns A `TaskRenderer` plus the `calls` array it records into.
 */
function recordingRenderer() {
  const calls: { hook: keyof TaskRenderer; state: Task }[] = [];
  const record = (hook: keyof TaskRenderer) => (state: Task) => calls.push({ hook, state });
  const ui: TaskRenderer = {
    start: record('start'),
    update: record('update'),
    succeed: record('succeed'),
    fail: record('fail'),
  };
  return { renderer: ui, calls };
}

// Minimal Context. `run` ignores its deps in these tests, so most fields can stay empty; we only
// need `options` to exist (the engine reads experimental_* hooks off it) and `now` for the timer.
function fakeContext(overrides: Partial<Context> = {}): Context {
  return { options: {}, ...overrides } as Context;
}

const transitions = {
  pending: () => ({ status: 'pending', title: 'Doing the thing', output: 'working...' }),
  success: () => ({ status: 'success', title: 'Did the thing', output: 'all done' }),
};

describe('runTask', () => {
  /**
   * These tests are strictly testing the `runTask` orchestration logic, i.e., that the engine drives a task, its configuration,
   * including transitions, and a renderer. Task business logic is tested elsewhere, as is rendering logic.
   */
  it('drives the full lifecycle', async () => {
    const ctx = fakeContext({ now: 1000 });
    const { renderer, calls } = recordingRenderer();

    const config: TaskConfig<{ value: number }, { doubled: number }> = {
      name: 'auth',
      title: 'Authenticate',
      transitions,
      extractInput: () => ({ value: 1 }),
      run: async (_deps, input) => ({ kind: 'continue', output: { doubled: input.value * 2 } }),
      applyOutput: (c, output) => {
        // applyOutput is where business results land back on the context. Just shoving the result on an arbitrary field for demonstration purposes
        (c as any).result = output.doubled;
      },
    };

    await runTask(ctx, config, renderer);

    // The UI saw exactly: start (pending) -> succeed (success). No update, no fail.
    expect(calls.map((c) => c.hook)).toEqual(['start', 'succeed']);
    expect(calls[0].state.title).toBe('Doing the thing');
    expect(calls[1].state.title).toBe('Did the thing');

    // Business logic ran and result was applied to context
    expect((ctx as any).result).toBe(2);
    expect(ctx.task).toBe('auth');
    expect(ctx.title).toBe('Did the thing');
  });

  it('uses the injected ctx.now', async () => {
    const ctx = fakeContext({ now: 123_456 });
    const { renderer } = recordingRenderer();

    await runTask(
      ctx,
      {
        name: 'auth',
        title: 'Authenticate',
        transitions,
        extractInput: () => ({}),
        run: async () => ({ kind: 'continue', output: {} }),
      },
      renderer
    );

    expect(ctx.startedAt).toBe(123_456);
  });

  it('fires the experimental task lifecycle callbacks', async () => {
    const onTaskStart = vi.fn();
    const onTaskComplete = vi.fn();
    const ctx = fakeContext({
      options: {
        experimental_onTaskStart: onTaskStart,
        experimental_onTaskComplete: onTaskComplete,
      } as any,
    });
    const { renderer } = recordingRenderer();

    await runTask(
      ctx,
      {
        name: 'auth',
        title: 'Authenticate',
        transitions,
        extractInput: () => ({}),
        run: async () => ({ kind: 'continue', output: {} }),
      },
      renderer
    );

    expect(onTaskStart).toHaveBeenCalledOnce();
    expect(onTaskComplete).toHaveBeenCalledOnce();
  });

  it('marks the context skipped and still succeeds on a skip result', async () => {
    const ctx = fakeContext();
    const { renderer, calls } = recordingRenderer();

    await runTask(
      ctx,
      {
        name: 'auth',
        title: 'Authenticate',
        transitions,
        extractInput: () => ({}),
        run: async () => ({ kind: 'skip' }),
      },
      renderer
    );

    // start still fires — the engine can't know it'll skip until after run() returns.
    expect(calls.map((c) => c.hook)).toEqual(['start', 'succeed']);
    expect(ctx.skip).toBe(true);
  });

  it('falls back to a generic failure headline when no failure transition is provided', async () => {
    const ctx = fakeContext();
    const { renderer, calls } = recordingRenderer();

    const boom = new Error('the network exploded\nwith details');
    const run = async () => {
      throw boom;
    };

    // runTask rethrows after calling renderer.fail, so the caller's error handling still works.
    await expect(
      runTask(
        ctx,
        { name: 'auth', title: 'Authenticate', transitions, extractInput: () => ({}), run },
        renderer
      )
    ).rejects.toThrow('the network exploded');

    const fail = calls.find((c) => c.hook === 'fail');
    expect(fail?.state.title).toBe('Doing the thing failed');
    expect(fail?.state.output).toBe('the network exploded\nwith details');
  });

  it('prefers an explicit failure transition when the task provides one', async () => {
    const ctx = fakeContext();
    const { renderer, calls } = recordingRenderer();

    const config: TaskConfig<unknown, unknown> = {
      name: 'auth',
      title: 'Authenticate',
      transitions: {
        ...transitions,
        failure: (_ctx, error) => ({
          status: 'error',
          title: 'Authentication failed',
          output: error.message,
        }),
      },
      extractInput: () => ({}),
      run: async () => {
        throw new Error('invalid token');
      },
    };

    await expect(runTask(ctx, config, renderer)).rejects.toThrow('invalid token');

    const fail = calls.find((c) => c.hook === 'fail');
    expect(fail?.state.title).toBe('Authentication failed');
  });
});
