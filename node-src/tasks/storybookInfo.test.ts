import { describe, expect, it, vi } from 'vitest';

import { getStorybookBaseDirectory } from '../lib/getStorybookBaseDirectory';
import { setStorybookInfo } from './storybookInfo';

vi.mock('../lib/getStorybookBaseDirectory');

const mockedGetStorybookBaseDirectory = vi.mocked(getStorybookBaseDirectory);

describe('storybookInfo', () => {
  it('retrieves Storybook metadata and sets it on context', async () => {
    const storybook = { version: '1.0.0', addons: [] };
    const detect = vi.fn().mockResolvedValue(storybook);
    mockedGetStorybookBaseDirectory.mockReturnValue('');

    const ctx = {
      packageJson: {},
      git: { rootDir: process.cwd() },
      ports: {
        storybook: { detect },
        errors: { setTag: vi.fn(), setContext: vi.fn(), captureException: vi.fn(), flush: vi.fn() },
      },
    } as any;
    await setStorybookInfo(ctx);
    expect(detect).toHaveBeenCalledWith(ctx);
    expect(ctx.storybook).toEqual({
      ...storybook,
      baseDir: '',
    });
  });
});
