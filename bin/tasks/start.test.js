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
    };
    await startStorybook(ctx);
    expect(ctx.isolatorUrl).toBe(ctx.options.url);
    expect(startApp).toHaveBeenCalledWith({
      ctx,
      scriptName: ctx.options.scriptName,
      commandName: ctx.options.exec,
      url: ctx.options.url,
      args: undefined,
      options: { stdio: 'pipe' },
    });
  });
});
