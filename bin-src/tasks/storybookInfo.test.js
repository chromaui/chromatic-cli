import getStorybookInfo from '../lib/getStorybookInfo';
import { setStorybookInfo } from './storybookInfo';

jest.mock('../lib/getStorybookInfo');

describe('startStorybook', () => {
  it('starts the app and sets the isolatorUrl on context', async () => {
    const storybook = { version: '1.0.0', viewLayer: 'react', addons: [] };
    getStorybookInfo.mockReturnValue(storybook);

    const ctx = {};
    await setStorybookInfo(ctx);
    expect(ctx.storybook).toEqual(storybook);
  });
});
