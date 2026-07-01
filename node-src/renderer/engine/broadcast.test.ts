import { describe, expect, it } from 'vitest';

import { Task } from '../../types';
import { broadcastRenderer } from './broadcast';
import { TaskRenderer } from './index';

/**
 * A `TaskRenderer` that records every hook call, and can be configured to throw on a chosen hook.
 *
 * @param throwOn An optional hook name that should throw when called.
 *
 * @returns A `TaskRenderer` plus the `calls` array it records into.
 */
function recordingRenderer(throwOn?: keyof TaskRenderer) {
  const calls: { hook: keyof TaskRenderer; state: Task }[] = [];
  const record = (hook: keyof TaskRenderer) => (state: Task) => {
    if (hook === throwOn) throw new Error(`boom from ${hook}`);
    calls.push({ hook, state });
  };
  const renderer: TaskRenderer = {
    start: record('start'),
    update: record('update'),
    succeed: record('succeed'),
    fail: record('fail'),
  };
  return { renderer, calls };
}

/**
 * Collects the `(error, hook)` pairs passed to the injected `onError` callback.
 *
 * @returns An `onError` sink plus the `errors` array it records into.
 */
function recordingOnError() {
  const errors: { error: unknown; hook: keyof TaskRenderer }[] = [];
  return {
    onError: (error: unknown, hook: keyof TaskRenderer) => errors.push({ error, hook }),
    errors,
  };
}

const task: Task = { status: 'pending', title: 'Doing the thing', output: 'working...' };

describe('broadcastRenderer', () => {
  it('fans each hook out to every renderer', () => {
    const a = recordingRenderer();
    const b = recordingRenderer();
    const { onError, errors } = recordingOnError();

    const broadcast = broadcastRenderer([a.renderer, b.renderer], onError);
    broadcast.start(task);
    broadcast.update(task);
    broadcast.succeed(task);
    broadcast.fail(task);

    const hooks = ['start', 'update', 'succeed', 'fail'];
    expect(a.calls.map((c) => c.hook)).toEqual(hooks);
    expect(b.calls.map((c) => c.hook)).toEqual(hooks);
    for (const { state } of [...a.calls, ...b.calls]) expect(state).toBe(task);
    expect(errors).toEqual([]);
  });

  it('still runs sibling renderers when one throws', () => {
    const thrower = recordingRenderer('start');
    const sibling = recordingRenderer();
    const { onError, errors } = recordingOnError();

    const broadcast = broadcastRenderer([thrower.renderer, sibling.renderer], onError);
    broadcast.start(task);

    expect(sibling.calls.map((c) => c.hook)).toEqual(['start']);
    expect(errors.map((error) => error.hook)).toEqual(['start']);
  });

  it('does not propagate a throwing hook to the caller', () => {
    const thrower = recordingRenderer('fail');
    const { onError } = recordingOnError();

    const broadcast = broadcastRenderer([thrower.renderer], onError);

    expect(() => broadcast.fail(task)).not.toThrow();
  });

  it('surfaces a renderer throw via onError with the error and hook', () => {
    const thrower = recordingRenderer('update');
    const { onError, errors } = recordingOnError();

    const broadcast = broadcastRenderer([thrower.renderer], onError);
    broadcast.update(task);

    expect(errors).toHaveLength(1);
    expect(errors[0].hook).toBe('update');
    expect((errors[0].error as Error).message).toBe('boom from update');
  });

  it('keeps delivering later hooks to a renderer that threw on an earlier hook', () => {
    const thrower = recordingRenderer('start');
    const { onError, errors } = recordingOnError();

    const broadcast = broadcastRenderer([thrower.renderer], onError);
    broadcast.start(task);
    broadcast.update(task);
    broadcast.succeed(task);

    expect(thrower.calls.map((c) => c.hook)).toEqual(['update', 'succeed']);
    expect(errors.map((error) => error.hook)).toEqual(['start']);
  });

  it('reports once per failing renderer when multiple throw on the same hook', () => {
    const first = recordingRenderer('start');
    const second = recordingRenderer('start');
    const { onError, errors } = recordingOnError();

    const broadcast = broadcastRenderer([first.renderer, second.renderer], onError);
    broadcast.start(task);

    expect(errors.map((error) => error.hook)).toEqual(['start', 'start']);
  });

  it('swallows a throw from onError rather than propagating it to the caller', () => {
    const thrower = recordingRenderer('start');
    const broadcast = broadcastRenderer([thrower.renderer], () => {
      throw new Error('boom from onError');
    });

    expect(() => broadcast.start(task)).not.toThrow();
  });

  it('is a no-op with an empty renderer list', () => {
    const { onError, errors } = recordingOnError();
    const broadcast = broadcastRenderer([], onError);

    expect(() => {
      broadcast.start(task);
      broadcast.update(task);
      broadcast.succeed(task);
      broadcast.fail(task);
    }).not.toThrow();
    expect(errors).toEqual([]);
  });
});
