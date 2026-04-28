import { describe, expect, it } from 'vitest';

import type { UI } from './ui';
import { createInMemoryUI, InMemoryUIState, RecordedUIEvent } from './uiInMemoryAdapter';
import { createListrUI } from './uiListrAdapter';

interface AdapterSetup {
  adapter: UI;
  /** Read the current title/output of the active task. */
  snapshot: () => { title?: string; output?: string };
  /** Read the recorded events (only present for the in-memory adapter). */
  events?: () => RecordedUIEvent[];
}

function listrSetup(): AdapterSetup {
  const task: { title?: string; output?: string } = { title: 'initial' };
  const adapter = createListrUI();
  // For the contract tests we synchronously bind the task so each test can act
  // without orchestrating withTask.
  void adapter.withTask(task, async () => {});
  return {
    adapter: {
      ...adapter,
      // Wrap each method so they target the bound task.
      taskStart: (state) => adapter.withTask(task, async () => adapter.taskStart(state)).then(),
      taskUpdate: (state) => adapter.withTask(task, async () => adapter.taskUpdate(state)).then(),
      taskSucceed: (state) => adapter.withTask(task, async () => adapter.taskSucceed(state)).then(),
      taskFail: (state) => adapter.withTask(task, async () => adapter.taskFail(state)).then(),
      progress: (progress) => adapter.withTask(task, async () => adapter.progress(progress)).then(),
      withTask: adapter.withTask,
    } as UI,
    snapshot: () => ({ title: task.title, output: task.output }),
  };
}

function inMemorySetup(): AdapterSetup {
  const state: InMemoryUIState = {};
  return {
    adapter: createInMemoryUI(state),
    snapshot: () => {
      const last = (state.events ?? []).at(-1);
      if (!last) return {};
      if (last.type === 'progress') return { output: undefined };
      return { title: last.state?.title, output: last.state?.output };
    },
    events: () => state.events ?? [],
  };
}

describe('UI (listr)', () => {
  it('writes title and output through to the active task', async () => {
    const { adapter, snapshot } = listrSetup();
    adapter.taskUpdate({ title: 'Working', output: 'step 1' });
    // Allow the queued microtask from the wrapper to flush.
    await Promise.resolve();
    expect(snapshot()).toEqual({ title: 'Working', output: 'step 1' });
  });

  it('renders progress() events as output text', async () => {
    const { adapter, snapshot } = listrSetup();
    adapter.progress({ current: 3, total: 10, unit: 'snapshots', label: 'Foo' });
    await Promise.resolve();
    expect(snapshot().output).toBe('3/10 snapshots: Foo');
  });

  it('restores the previous active task after withTask resolves', async () => {
    const adapter = createListrUI();
    const outer = { title: 'outer', output: undefined as string | undefined };
    const inner = { title: 'inner', output: undefined as string | undefined };
    await adapter.withTask(outer, async () => {
      adapter.taskUpdate({ output: 'a' });
      await adapter.withTask(inner, async () => {
        adapter.taskUpdate({ output: 'b' });
      });
      adapter.taskUpdate({ output: 'c' });
    });
    expect(outer.output).toBe('c');
    expect(inner.output).toBe('b');
  });
});

describe('UI (in-memory)', () => {
  it('records every event in order', () => {
    const { adapter, events } = inMemorySetup();
    adapter.taskStart({ title: 'A' });
    adapter.taskUpdate({ output: 'tick' });
    adapter.progress({ current: 1, total: 2, unit: 'files' });
    adapter.taskSucceed({ title: 'A done' });
    expect(events?.()).toEqual([
      { type: 'taskStart', state: { title: 'A' } },
      { type: 'taskUpdate', state: { output: 'tick' } },
      { type: 'progress', progress: { current: 1, total: 2, unit: 'files' } },
      { type: 'taskSucceed', state: { title: 'A done' } },
    ]);
  });
});
