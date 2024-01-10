import { describe, expect, it, vi } from 'vitest';

import storybookInfo from '../lib/getStorybookInfo';
import { setStorybookInfo } from './storybookInfo';

vi.mock('../lib/getStorybookInfo');

const getStorybookInfo = vi.mocked(storybookInfo);

describe('startStorybook', () => {
  it('starts the app and sets the isolatorUrl on context', async () => {
    const storybook = { version: '1.0.0', viewLayer: 'react', addons: [] };
    getStorybookInfo.mockResolvedValue(storybook);

    const ctx = {} as any;
    await setStorybookInfo(ctx);
    expect(ctx.storybook).toEqual(storybook);
  });
});
