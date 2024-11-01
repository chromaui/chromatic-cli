import { describe, expect, it, vi } from 'vitest';

import storybookInfo from '../lib/getStorybookInfo';
import { setStorybookInfo } from './storybookInfo';

vi.mock('../lib/getStorybookInfo');

const getStorybookInfo = vi.mocked(storybookInfo);

describe('storybookInfo', () => {
  it('retrieves Storybook metadata and sets it on context', async () => {
    const storybook = { version: '1.0.0', viewLayer: 'react', addons: [] };
    getStorybookInfo.mockResolvedValue(storybook);

    const ctx = { packageJson: {} } as any;
    await setStorybookInfo(ctx);
    expect(ctx.storybook).toEqual(storybook);
  });
});
