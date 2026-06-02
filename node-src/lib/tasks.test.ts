import { describe, expect, it, vi } from 'vitest';

import { Context } from '../types';
import { createTask } from './tasks';

const baseContext = (): Context =>
  ({
    options: {},
    runtime: {},
    log: { debug: vi.fn() },
  }) as any;

describe('createTask (typed shape)', () => {
  it('extracts input, runs, applies output', async () => {
    const ctx = baseContext();
    const run = vi.fn().mockResolvedValue({ kind: 'continue', output: { token: 'abc' } });
    const applyOutput = vi.fn();

    const listrTask = createTask<{ x: number }, { token: string }>({
      name: 'auth',
      title: 'Test',
      extractInput: () => ({ x: 1 }),
      applyOutput,
      run,
    });

    await (listrTask.task as any)(ctx, {});

    expect(run).toHaveBeenCalledWith(expect.any(Object), { x: 1 });
    expect(applyOutput).toHaveBeenCalledWith(ctx, { token: 'abc' });
  });

  it('sets ctx.skip on skip result by default and does not call apply callbacks', async () => {
    const ctx = baseContext();
    const run = vi.fn().mockResolvedValue({ kind: 'skip', reason: 'no work' });
    const applyOutput = vi.fn();
    const applyPartial = vi.fn();

    const listrTask = createTask({
      name: 'auth',
      title: 'Test',
      extractInput: () => ({}),
      applyOutput,
      applyPartial,
      run,
    });

    await (listrTask.task as any)(ctx, {});

    expect(applyOutput).not.toHaveBeenCalled();
    expect(applyPartial).not.toHaveBeenCalled();
    expect(ctx.skip).toBe(true);
  });

  it('applies partial output and sets ctx.skip on partial result by default', async () => {
    const ctx = baseContext();
    const run = vi
      .fn()
      .mockResolvedValue({ kind: 'partial', output: { partial: 'data' }, reason: 'rebuild' });
    const applyOutput = vi.fn();
    const applyPartial = vi.fn();

    const listrTask = createTask({
      name: 'gitInfo',
      title: 'Test',
      extractInput: () => ({}),
      applyOutput,
      applyPartial,
      run,
    });

    await (listrTask.task as any)(ctx, {});

    expect(applyOutput).not.toHaveBeenCalled();
    expect(applyPartial).toHaveBeenCalledWith(ctx, { partial: 'data' });
    expect(ctx.skip).toBe(true);
  });

  it('fires transitions.partial after applyPartial on partial result', async () => {
    const ctx = baseContext();
    const partialOutput = { phase: 'rebuild-noop' };
    const run = vi.fn().mockResolvedValue({ kind: 'partial', output: partialOutput });
    const applyPartial = vi.fn();
    const partialTransition = vi
      .fn()
      .mockReturnValue({ status: 'success', title: 'Skipped', output: 'rebuilt' });
    const listrTask = createTask({
      name: 'gitInfo',
      title: 'Test',
      transitions: { partial: partialTransition },
      extractInput: () => ({}),
      applyPartial,
      run,
    });

    const taskWrapper: any = {};
    await (listrTask.task as any)(ctx, taskWrapper);

    expect(applyPartial).toHaveBeenCalledWith(ctx, partialOutput);
    expect(partialTransition).toHaveBeenCalledWith(ctx, partialOutput);
    expect(taskWrapper.title).toContain('Skipped');
    expect(ctx.skip).toBe(true);
  });

  it('passes listrTask to extractInput', async () => {
    const ctx = baseContext();
    const extractInput = vi.fn().mockReturnValue({});
    const run = vi.fn().mockResolvedValue({ kind: 'continue', output: {} });

    const listrTask = createTask({
      name: 'auth',
      title: 'Test',
      extractInput,
      run,
    });

    const taskWrapper = { title: '' };
    await (listrTask.task as any)(ctx, taskWrapper);

    expect(extractInput).toHaveBeenCalledWith(ctx, taskWrapper);
  });

  it('still supports legacy steps[] config for unmigrated tasks', async () => {
    const ctx = baseContext();
    const step1 = vi.fn();
    const step2 = vi.fn();

    const listrTask = createTask({
      name: 'auth',
      title: 'Test',
      steps: [step1, step2],
    });

    await (listrTask.task as any)(ctx, {});

    expect(step1).toHaveBeenCalled();
    expect(step2).toHaveBeenCalled();
  });
});
