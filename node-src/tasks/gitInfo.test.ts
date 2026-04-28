import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GitInfoPhaseOutput } from '../run/phases/gitInfo';
import * as phaseModule from '../run/phases/gitInfo';
import { setGitInfo } from './gitInfo';

vi.mock('../run/phases/gitInfo');

const runGitInfoPhase = vi.mocked(phaseModule.runGitInfoPhase);

afterEach(() => {
  vi.clearAllMocks();
});

function baseSlice(overrides: Partial<GitInfoPhaseOutput> = {}): GitInfoPhaseOutput {
  return {
    git: { branch: 'feature', commit: 'sha', committedAt: 1, fromCI: false } as any,
    projectMetadata: { hasRouter: true },
    isOnboarding: false,
    outcome: { kind: 'continue' },
    ...overrides,
  };
}

function makeContext(overrides: Record<string, unknown> = {}): any {
  return {
    options: {},
    packageJson: {},
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ports: { git: {}, chromatic: {} },
    ...overrides,
  };
}

describe('setGitInfo', () => {
  it('mirrors phase output onto context for downstream phases', async () => {
    runGitInfoPhase.mockResolvedValue(
      baseSlice({
        rebuildForBuildId: 'rebuild-id',
        optionsOverride: { forceRebuild: true },
      })
    );
    const ctx = makeContext();
    await setGitInfo(ctx, { title: '' });
    expect(ctx.git).toMatchObject({ branch: 'feature', commit: 'sha' });
    expect(ctx.projectMetadata).toEqual({ hasRouter: true });
    expect(ctx.isOnboarding).toBe(false);
    expect(ctx.options.forceRebuild).toBe(true);
    expect(ctx.rebuildForBuildId).toBe('rebuild-id');
  });

  it('marks ctx.skip on skip-commit outcome', async () => {
    runGitInfoPhase.mockResolvedValue(baseSlice({ outcome: { kind: 'skip-commit' } }));
    const ctx = makeContext();
    await setGitInfo(ctx, { title: '' });
    expect(ctx.skip).toBe(true);
    expect(ctx.exitCode).toBe(0);
  });

  it('records rebuild target on skip-rebuild outcome', async () => {
    const rebuild = { id: 'r1', storybookUrl: 'https://sb.example.com' } as any;
    runGitInfoPhase.mockResolvedValue(
      baseSlice({
        outcome: {
          kind: 'skip-rebuild',
          rebuildForBuild: rebuild,
          storybookUrl: rebuild.storybookUrl,
        },
        rebuildForBuildId: 'r1',
      })
    );
    const ctx = makeContext();
    await setGitInfo(ctx, { title: '' });
    expect(ctx.skip).toBe(true);
    expect(ctx.rebuildForBuild).toBe(rebuild);
    expect(ctx.storybookUrl).toBe(rebuild.storybookUrl);
    expect(ctx.exitCode).toBe(0);
  });

  it('writes turboSnap and baseline build placeholder on continue outcome', async () => {
    const baseline = { id: 'b1' } as any;
    runGitInfoPhase.mockResolvedValue(
      baseSlice({
        outcome: {
          kind: 'continue',
          turboSnap: { bailReason: { rebuild: true } },
          build: baseline,
        },
      })
    );
    const ctx = makeContext();
    await setGitInfo(ctx, { title: '' });
    expect(ctx.turboSnap).toEqual({ bailReason: { rebuild: true } });
    expect(ctx.build).toBe(baseline);
  });
});
