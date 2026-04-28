import { afterEach, describe, expect, it, vi } from 'vitest';

import * as phaseModule from '../run/phases/storybookInfo';
import { setStorybookInfo } from './storybookInfo';

vi.mock('../run/phases/storybookInfo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../run/phases/storybookInfo')>();
  return { ...actual, runStorybookInfoPhase: vi.fn() };
});

const runStorybookInfoPhase = vi.mocked(phaseModule.runStorybookInfoPhase);

afterEach(() => {
  vi.clearAllMocks();
});

describe('setStorybookInfo', () => {
  it('mirrors the StorybookState slice onto context', async () => {
    runStorybookInfoPhase.mockResolvedValueOnce({
      version: '7.0.0',
      configDir: '.storybook',
      staticDir: [],
      addons: [],
      builder: { name: 'webpack' },
      baseDir: '',
    } as any);
    const ctx = {
      options: {},
      git: {},
      log: { debug: vi.fn() },
      ports: {},
    } as any;
    await setStorybookInfo(ctx);
    expect(ctx.storybook.version).toBe('7.0.0');
  });
});
