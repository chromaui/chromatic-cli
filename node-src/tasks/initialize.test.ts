import { afterEach, describe, expect, it, vi } from 'vitest';

import * as phaseModule from '../run/phases/initialize';
import { announceBuild } from './initialize';

vi.mock('../run/phases/initialize', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../run/phases/initialize')>();
  return { ...actual, runInitializePhase: vi.fn() };
});

const runInitializePhase = vi.mocked(phaseModule.runInitializePhase);

afterEach(() => {
  vi.clearAllMocks();
});

function makeContext(overrides: Record<string, unknown> = {}): any {
  return {
    options: {},
    env: {},
    git: {},
    storybook: {},
    pkg: { version: '1.0.0' },
    ports: {},
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  };
}

describe('announceBuild', () => {
  it('mirrors the AnnouncedState slice + side effects onto context', async () => {
    runInitializePhase.mockResolvedValueOnce({
      announcedBuild: { id: 'b', number: 2, app: { id: 'a' } } as any,
      isOnboarding: true,
      isReactNativeApp: false,
      environment: { GERRIT_BRANCH: 'foo' },
      runtimeMetadata: {
        nodePlatform: 'darwin',
        nodeVersion: '20',
        packageManager: 'npm',
        packageManagerVersion: '10',
      } as any,
      turboSnap: { unavailable: true },
    });
    const ctx = makeContext();
    await announceBuild(ctx);
    expect(ctx.announcedBuild.id).toBe('b');
    expect(ctx.isOnboarding).toBe(true);
    expect(ctx.isReactNativeApp).toBe(false);
    expect(ctx.environment).toEqual({ GERRIT_BRANCH: 'foo' });
    expect(ctx.runtimeMetadata.packageManager).toBe('npm');
    expect(ctx.turboSnap?.unavailable).toBe(true);
  });

  it('rethrows phase errors verbatim', async () => {
    const error = new Error('TurboSnap is not supported for Storybook React Native projects.');
    runInitializePhase.mockRejectedValueOnce(error);
    const ctx = makeContext();
    await expect(announceBuild(ctx)).rejects.toBe(error);
  });
});
