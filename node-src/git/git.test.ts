import { execaCommand } from 'execa';
import { describe, expect, it, vi } from 'vitest';

import { getCommit, getSlug } from './git';

vi.mock('execa');

const command = vi.mocked(execaCommand);

describe('getCommit', () => {
  it('parses log output', async () => {
    command.mockImplementation(
      () =>
        Promise.resolve({
          all: `19b6c9c5b3d34d9fc55627fcaf8a85bd5d5e5b2a ## 1696588814 ## info@ghengeveld.nl ## Gert Hengeveld`,
        }) as any
    );
    expect(await getCommit()).toEqual({
      commit: '19b6c9c5b3d34d9fc55627fcaf8a85bd5d5e5b2a',
      committedAt: 1696588814 * 1000,
      committerEmail: 'info@ghengeveld.nl',
      committerName: 'Gert Hengeveld',
    });
  });

  it('ignores gpg signature information', async () => {
    command.mockImplementation(
      () =>
        Promise.resolve({
          all: `
gpg: Signature made Fri Oct  6 12:40:14 2023 CEST
gpg:                using RSA key 4AEE18F83AFDEB23
gpg: Can't check signature: No public key
19b6c9c5b3d34d9fc55627fcaf8a85bd5d5e5b2a ## 1696588814 ## info@ghengeveld.nl ## Gert Hengeveld
          `.trim(),
        }) as any
    );
    expect(await getCommit()).toEqual({
      commit: '19b6c9c5b3d34d9fc55627fcaf8a85bd5d5e5b2a',
      committedAt: 1696588814 * 1000,
      committerEmail: 'info@ghengeveld.nl',
      committerName: 'Gert Hengeveld',
    });
  });
});

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
