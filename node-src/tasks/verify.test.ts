import { afterEach, describe, expect, it, vi } from 'vitest';

import { exitCodes } from '../lib/setExitCode';
import * as phaseModule from '../run/phases/verify';
import { VerifyPhaseError } from '../run/phases/verify';
import { verify } from './verify';

vi.mock('../run/phases/verify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../run/phases/verify')>();
  return { ...actual, runVerifyPhase: vi.fn() };
});

const runVerifyPhase = vi.mocked(phaseModule.runVerifyPhase);

afterEach(() => {
  vi.clearAllMocks();
});

const fakeTask = { title: '' } as any;

function makeContext(overrides: Record<string, unknown> = {}): any {
  return {
    options: {},
    env: {},
    git: {},
    storybook: {},
    announcedBuild: { id: 'b', number: 1 },
    ports: { ui: { taskUpdate: vi.fn() } },
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  };
}

describe('verify', () => {
  it('mirrors the VerifiedState slice onto context', async () => {
    runVerifyPhase.mockResolvedValueOnce({
      announcedBuild: { id: 'b', number: 1, status: 'PUBLISHED' } as any,
      build: { id: 'b', number: 1, status: 'IN_PROGRESS' } as any,
      storybookUrl: 'https://sb',
      isPublishOnly: false,
    });
    const ctx = makeContext();
    await verify(ctx, fakeTask);
    expect(ctx.build.status).toBe('IN_PROGRESS');
    expect(ctx.storybookUrl).toBe('https://sb');
    expect(ctx.skipSnapshots).toBeUndefined();
  });

  it('skips when ctx.skip is set', async () => {
    const ctx = makeContext({ skip: true });
    await verify(ctx, fakeTask);
    expect(runVerifyPhase).not.toHaveBeenCalled();
  });

  it('applies non-throw exit-code intents via setExitCode', async () => {
    runVerifyPhase.mockResolvedValueOnce({
      announcedBuild: { id: 'b' } as any,
      build: { id: 'b' } as any,
      storybookUrl: '',
      isPublishOnly: true,
      skipSnapshots: true,
      exitCodeIntent: { exitCode: exitCodes.OK, userError: false },
    });
    const ctx = makeContext();
    await verify(ctx, fakeTask);
    expect(ctx.exitCode).toBe(exitCodes.OK);
    expect(ctx.skipSnapshots).toBe(true);
  });

  it('translates VerifyPhaseError into setExitCode + a rethrow', async () => {
    const error = new VerifyPhaseError('boom', exitCodes.STORYBOOK_BROKEN, true);
    runVerifyPhase.mockRejectedValueOnce(error);
    const ctx = makeContext();
    await expect(verify(ctx, fakeTask)).rejects.toBe(error);
    expect(ctx.exitCode).toBe(exitCodes.STORYBOOK_BROKEN);
    expect(ctx.userError).toBe(true);
  });

  it('rethrows non-VerifyPhaseError unchanged', async () => {
    const original = new Error('weird');
    runVerifyPhase.mockRejectedValueOnce(original);
    const ctx = makeContext();
    await expect(verify(ctx, fakeTask)).rejects.toBe(original);
    expect(ctx.exitCode).toBeUndefined();
  });
});
