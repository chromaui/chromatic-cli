import { afterEach, describe, expect, it, vi } from 'vitest';

import { exitCodes } from '../lib/setExitCode';
import * as phaseModule from '../run/phases/snapshot';
import { takeSnapshots } from './snapshot';

vi.mock('../run/phases/snapshot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../run/phases/snapshot')>();
  return { ...actual, runSnapshotPhase: vi.fn() };
});

const runSnapshotPhase = vi.mocked(phaseModule.runSnapshotPhase);

afterEach(() => {
  vi.clearAllMocks();
});

const fakeTask = { title: '', output: '' } as any;

function makeContext(overrides: Record<string, unknown> = {}): any {
  return {
    options: {},
    env: {},
    git: {},
    build: { id: 'b', number: 1 },
    ports: { ui: { taskUpdate: vi.fn() } },
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  };
}

describe('takeSnapshots', () => {
  it('mirrors SnapshotState onto context and applies the exit code intent', async () => {
    runSnapshotPhase.mockResolvedValueOnce({
      build: { id: 'b', status: 'PASSED', autoAcceptChanges: false } as any,
      outcome: 'passed',
      exitCodeIntent: { exitCode: exitCodes.OK, userError: false },
    });
    const ctx = makeContext();
    await takeSnapshots(ctx, fakeTask);
    expect(ctx.build.status).toBe('PASSED');
    expect(ctx.exitCode).toBe(exitCodes.OK);
  });

  it('forwards onProgress to ports.ui.taskUpdate', async () => {
    runSnapshotPhase.mockImplementationOnce(async ({ onProgress }) => {
      onProgress?.({ cursor: 1, total: 4, output: 'snapshot 1/4' });
      return {
        build: { id: 'b', status: 'PASSED' } as any,
        outcome: 'passed',
        exitCodeIntent: { exitCode: exitCodes.OK, userError: false },
      };
    });
    const ctx = makeContext();
    await takeSnapshots(ctx, fakeTask);
    expect(ctx.ports.ui.taskUpdate).toHaveBeenCalledWith({ output: 'snapshot 1/4' });
  });

  it('sets BUILD_HAS_CHANGES when the phase reports has-changes outcome', async () => {
    runSnapshotPhase.mockResolvedValueOnce({
      build: { id: 'b', status: 'ACCEPTED' } as any,
      outcome: 'has-changes',
      exitCodeIntent: { exitCode: exitCodes.BUILD_HAS_CHANGES, userError: true },
    });
    const ctx = makeContext();
    await takeSnapshots(ctx, fakeTask);
    expect(ctx.exitCode).toBe(exitCodes.BUILD_HAS_CHANGES);
    expect(ctx.userError).toBe(true);
  });
});
