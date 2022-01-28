import storybookInfo from '../lib/getStorybookInfo';
import { setStorybookInfo } from './storybookInfo';

jest.mock('../lib/getStorybookInfo');

const getStorybookInfo = <jest.MockedFunction<typeof storybookInfo>>storybookInfo;

describe('startStorybook', () => {
  it('starts the app and sets the isolatorUrl on context', async () => {
    const storybook = { version: '1.0.0', viewLayer: 'react', addons: [] };
    getStorybookInfo.mockResolvedValue(storybook);

    const ctx = {} as any;
    await setStorybookInfo(ctx);
    expect(ctx.storybook).toEqual(storybook);
  });
});
