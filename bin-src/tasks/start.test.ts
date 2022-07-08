import startApp from '../lib/startStorybook';
import { startStorybook } from './start';

jest.mock('../lib/startStorybook');

describe('startStorybook', () => {
  it('starts the app and sets the isolatorUrl on context', async () => {
    const ctx = {
      storybook: {},
      options: {
        exec: 'node start.sh',
        scriptName: 'start-storybook',
        url: 'http://localhost:9001',
      },
    } as any;
    await startStorybook(ctx);
    expect(startApp).toHaveBeenCalledWith(ctx, {
      args: undefined,
      options: { stdio: 'pipe' },
    });
  });
});
