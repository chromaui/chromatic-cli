import { describe, expect, it, vi } from 'vitest';

import { getStorybookBaseDirectory } from '../lib/getStorybookBaseDirectory';
import storybookInfo from '../lib/getStorybookInfo';
import { setStorybookInfo } from './storybookInfo';

vi.mock('../lib/getStorybookInfo');
vi.mock('../lib/getStorybookBaseDirectory');

const getStorybookInfo = vi.mocked(storybookInfo);
const mockedGetStorybookBaseDirectory = vi.mocked(getStorybookBaseDirectory);

describe('storybookInfo', () => {
  it('retrieves Storybook metadata and sets it on context', async () => {
    const storybook = { version: '1.0.0', addons: [] };
    getStorybookInfo.mockResolvedValue(storybook);
    mockedGetStorybookBaseDirectory.mockReturnValue('');

    const ctx = { packageJson: {}, git: { rootDir: process.cwd() } } as any;
    await setStorybookInfo(ctx);
    expect(ctx.storybook).toEqual({
      ...storybook,
      baseDir: '',
    });
  });
});
