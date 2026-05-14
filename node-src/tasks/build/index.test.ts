import { existsSync as existsSyncDefault } from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import buildTask from './index';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => false),
  };
});

const existsSync = vi.mocked(existsSyncDefault);

const baseContext = { options: {}, flags: {} } as any;

beforeEach(() => {
  existsSync.mockClear();
});

describe('build task skip', () => {
  it('returns true when ctx.skip is set', async () => {
    const ctx = { ...baseContext, skip: true } as any;
    const task = buildTask(ctx);
    expect(await task.skip?.(ctx)).toBe(true);
  });

  it('returns false when isReactNativeApp and no storybookBuildDir', async () => {
    const ctx = { ...baseContext, isReactNativeApp: true } as any;
    const task = buildTask(ctx);
    expect(await task.skip?.(ctx)).toBe(false);
  });

  it('sets sourceDir and returns false when isReactNativeApp, storybookBuildDir set, and no manifest', async () => {
    existsSync.mockReturnValueOnce(false);
    const ctx = {
      ...baseContext,
      isReactNativeApp: true,
      options: { storybookBuildDir: '/path/to/rn-build' },
    } as any;
    const task = buildTask(ctx);
    expect(await task.skip?.(ctx)).toBe(false);
    expect(ctx.sourceDir).toBe('/path/to/rn-build');
  });

  it('sets sourceDir and returns skipped message when isReactNativeApp and manifest.json exists', async () => {
    existsSync.mockReturnValueOnce(true);
    const ctx = {
      ...baseContext,
      isReactNativeApp: true,
      options: { storybookBuildDir: '/path/to/rn-build' },
    } as any;
    const task = buildTask(ctx);
    expect(await task.skip?.(ctx)).toBe('Using prebuilt React Native assets');
    expect(ctx.sourceDir).toBe('/path/to/rn-build');
  });

  it('sets sourceDir and returns skipped message when storybookBuildDir is set for web', async () => {
    const ctx = {
      ...baseContext,
      options: { storybookBuildDir: '/path/to/sb-build' },
    } as any;
    const task = buildTask(ctx);
    const result = await task.skip?.(ctx);
    expect(result).toContain('/path/to/sb-build');
    expect(ctx.sourceDir).toBe('/path/to/sb-build');
  });

  it('returns false when no storybookBuildDir for web', async () => {
    const ctx = { ...baseContext } as any;
    const task = buildTask(ctx);
    expect(await task.skip?.(ctx)).toBe(false);
  });
});
