import { execaCommand } from 'execa';
import { describe, expect, it, vi } from 'vitest';

import { getSlug } from './git';

vi.mock('execa');

const command = vi.mocked(execaCommand);

describe('getSlug', () => {
  it('returns the slug portion of the git url', async () => {
    command.mockImplementation(
      () => Promise.resolve({ all: 'git@github.com:chromaui/chromatic-cli.git' }) as any
    );
    expect(await getSlug()).toBe('chromaui/chromatic-cli');

    command.mockImplementation(
      () => Promise.resolve({ all: 'https://github.com/chromaui/chromatic-cli' }) as any
    );
    expect(await getSlug()).toBe('chromaui/chromatic-cli');

    command.mockImplementation(
      () => Promise.resolve({ all: 'https://gitlab.com/foo/bar.baz.git' }) as any
    );
    expect(await getSlug()).toBe('foo/bar.baz');
  });
});
