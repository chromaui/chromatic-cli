import execa from 'execa';

import { getSlug } from './git';

const execaCommand = jest.spyOn(execa, 'command');

describe('getSlug', () => {
  it('returns the slug portion of the git url', async () => {
    execaCommand.mockImplementation(
      () => Promise.resolve({ all: 'git@github.com:chromaui/chromatic-cli.git' }) as any
    );
    expect(await getSlug()).toBe('chromaui/chromatic-cli');

    execaCommand.mockImplementation(
      () => Promise.resolve({ all: 'https://github.com/chromaui/chromatic-cli' }) as any
    );
    expect(await getSlug()).toBe('chromaui/chromatic-cli');

    execaCommand.mockImplementation(
      () => Promise.resolve({ all: 'https://gitlab.com/foo/bar.baz.git' }) as any
    );
    expect(await getSlug()).toBe('foo/bar.baz');
  });
});
