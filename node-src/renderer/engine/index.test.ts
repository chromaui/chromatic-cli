import { describe, expect, it, vi } from 'vitest';

import { exitCodes, TaskFailure } from '../../lib/setExitCode';
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
// need `options` to exist (the engine reads experimental_* hooks off it), `log` (the skip guard
// logs), and `now` for the timer.
function fakeContext(overrides: Partial<Context> = {}): Context {
  return { options: {}, log: { debug: vi.fn() }, ...overrides } as unknown as Context;
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
        run: async () => ({ kind: 'skip', reason: 'fully turbosnapped' }),
      },
      renderer
    );

    // start still fires — the engine can't know it'll skip until after run() returns.
    expect(calls.map((c) => c.hook)).toEqual(['start', 'succeed']);
    // The reason renders as output under the pending title (mirrors skip-self).
    expect(calls[1].state.output).toBe('fully turbosnapped');
    expect(ctx.skip).toBe(true);
  });

  it('succeeds without halting the pipeline on a skip-self result', async () => {
    const ctx = fakeContext();
    const { renderer, calls } = recordingRenderer();

    await runTask(
      ctx,
      {
        name: 'upload',
        title: 'Publish',
        transitions: {
          ...transitions,
          skipped: () => ({
            status: 'skipped',
            title: 'Skipped',
            output: 'Skipped due to --dry-run',
          }),
        },
        extractInput: () => ({}),
        run: async () => ({ kind: 'skip-self' }),
      },
      renderer
    );

    expect(calls.map((c) => c.hook)).toEqual(['start', 'succeed']);
    expect(calls[1].state.output).toBe('Skipped due to --dry-run');
    // The pipeline continues: ctx.skip stays unset so downstream tasks still run.
    expect(ctx.skip).toBeUndefined();
    expect(ctx.title).toBe('Skipped');
  });

  it('falls back to the pending state with the reason when skip-self has no skipped transition', async () => {
    const ctx = fakeContext();
    const { renderer, calls } = recordingRenderer();

    await runTask(
      ctx,
      {
        name: 'upload',
        title: 'Publish',
        transitions,
        extractInput: () => ({}),
        run: async () => ({ kind: 'skip-self', reason: 'nothing to do' }),
      },
      renderer
    );

    expect(calls.map((c) => c.hook)).toEqual(['start', 'succeed']);
    expect(calls[1].state.title).toBe('Doing the thing');
    expect(calls[1].state.output).toBe('nothing to do');
    expect(ctx.skip).toBeUndefined();
  });

  it('renders nothing and skips the task when an upstream task set ctx.skip', async () => {
    const ctx = fakeContext({ skip: true });
    const { renderer, calls } = recordingRenderer();
    const run = vi.fn(async () => ({ kind: 'continue' as const, output: {} }));

    await runTask(
      ctx,
      {
        name: 'storybookInfo',
        title: 'Collect metadata',
        transitions,
        extractInput: () => ({}),
        run,
      },
      renderer
    );

    expect(run).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
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

  it('applies the exit code from a TaskFailure before failing', async () => {
    const ctx = fakeContext();
    const { renderer, calls } = recordingRenderer();

    const config: TaskConfig<unknown, unknown> = {
      name: 'build',
      title: 'Build',
      transitions,
      extractInput: () => ({}),
      run: async () => {
        throw new TaskFailure('Command failed', {
          exitCode: exitCodes.NPM_BUILD_STORYBOOK_FAILED,
          userError: true,
        });
      },
    };

    await expect(runTask(ctx, config, renderer)).rejects.toThrow('Command failed');

    expect(ctx.exitCode).toBe(exitCodes.NPM_BUILD_STORYBOOK_FAILED);
    expect(ctx.exitCodeKey).toBe('NPM_BUILD_STORYBOOK_FAILED');
    expect(ctx.userError).toBe(true);
    expect(calls.some((c) => c.hook === 'fail')).toBe(true);
  });

  it('leaves the exit code untouched for a plain Error', async () => {
    const ctx = fakeContext();
    const { renderer } = recordingRenderer();

    const config: TaskConfig<unknown, unknown> = {
      name: 'build',
      title: 'Build',
      transitions,
      extractInput: () => ({}),
      run: async () => {
        throw new Error('boom');
      },
    };

    await expect(runTask(ctx, config, renderer)).rejects.toThrow('boom');

    expect(ctx.exitCode).toBeUndefined();
  });

  describe('deps.report (mid-task updates)', () => {
    it('routes a textual update to renderer.update without calling onTaskProgress', async () => {
      const onTaskProgress = vi.fn();
      const ctx = fakeContext({ options: { experimental_onTaskProgress: onTaskProgress } as any });
      const { renderer, calls } = recordingRenderer();

      const config: TaskConfig<unknown, unknown> = {
        name: 'gitInfo',
        title: 'Retrieving git information',
        transitions,
        extractInput: () => ({}),
        run: async (deps) => {
          deps.report({ title: 'Skipping build', output: 'no changes since last build' });
          return { kind: 'continue', output: {} };
        },
      };

      await runTask(ctx, config, renderer);

      const update = calls.find((c) => c.hook === 'update');
      expect(update?.state.title).toBe('Skipping build');
      expect(update?.state.output).toBe('no changes since last build');
      expect(update?.state.progress).toBeUndefined();
      expect(onTaskProgress).not.toHaveBeenCalled();
    });

    it('fans a numeric update out to both renderer.update and the public onTaskProgress hook', async () => {
      const onTaskProgress = vi.fn();
      const ctx = fakeContext({ options: { experimental_onTaskProgress: onTaskProgress } as any });
      const { renderer, calls } = recordingRenderer();

      const config: TaskConfig<unknown, unknown> = {
        name: 'upload',
        title: 'Uploading',
        transitions,
        extractInput: () => ({}),
        run: async (deps) => {
          deps.report({
            output: 'uploading',
            progress: { progress: 512, total: 1024, unit: 'bytes' },
          });
          return { kind: 'continue', output: {} };
        },
      };

      await runTask(ctx, config, renderer);

      const update = calls.find((c) => c.hook === 'update');
      expect(update?.state.progress).toEqual({ progress: 512, total: 1024, unit: 'bytes' });
      // No textual report preceded this one, so the update inherits the task's starting title.
      expect(update?.state.title).toBe('Uploading');

      expect(onTaskProgress).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
        progress: 512,
        total: 1024,
        unit: 'bytes',
      });
    });

    it('writes a reported build onto ctx so the onTaskProgress snapshot is live', async () => {
      const seen: Context[] = [];
      const onTaskProgress = vi.fn((ctxSnapshot: Context) => seen.push(ctxSnapshot));
      const ctx = fakeContext({
        build: { number: 1 } as any,
        options: { experimental_onTaskProgress: onTaskProgress } as any,
      });
      const { renderer } = recordingRenderer();

      const polledBuild = { number: 1, status: 'IN_PROGRESS' } as any;
      const config: TaskConfig<unknown, unknown> = {
        name: 'snapshot',
        title: 'Snapshotting',
        transitions,
        extractInput: () => ({}),
        run: async (deps) => {
          deps.report({
            progress: { progress: 1, total: 5, unit: 'snapshots' },
            build: polledBuild,
          });
          return { kind: 'continue', output: {} };
        },
      };

      await runTask(ctx, config, renderer);

      expect(ctx.build).toBe(polledBuild);
      expect(seen[0].build).toBe(polledBuild);
    });

    it('passes a numeric-only report through with no output', async () => {
      const ctx = fakeContext({ options: {} as any });
      const { renderer, calls } = recordingRenderer();

      const config: TaskConfig<unknown, unknown> = {
        name: 'upload',
        title: 'Uploading',
        transitions,
        extractInput: () => ({}),
        run: async (deps) => {
          deps.report({ progress: { progress: 512, total: 1024, unit: 'bytes' } });
          return { kind: 'continue', output: {} };
        },
      };

      await runTask(ctx, config, renderer);

      const update = calls.find((c) => c.hook === 'update');
      expect(update?.state.output).toBeUndefined();
      expect(update?.state.progress).toEqual({ progress: 512, total: 1024, unit: 'bytes' });
    });

    it('makes a textual update sticky: a later title-less report inherits the current title', async () => {
      const ctx = fakeContext({ options: {} as any });
      const { renderer, calls } = recordingRenderer();

      const config: TaskConfig<unknown, unknown> = {
        name: 'upload',
        title: 'Uploading',
        transitions,
        extractInput: () => ({}),
        run: async (deps) => {
          deps.report({ title: 'Finalizing' });
          deps.report({ progress: { progress: 512, total: 1024, unit: 'bytes' } });
          return { kind: 'continue', output: {} };
        },
      };

      await runTask(ctx, config, renderer);

      const updates = calls.filter((c) => c.hook === 'update');
      expect(updates[0].state.title).toBe('Finalizing');
      // The numeric-only report carries no title of its own, so it renders with the title set by
      // the preceding textual report.
      expect(updates[1].state.title).toBe('Finalizing');
    });
  });
});
