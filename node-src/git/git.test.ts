import { execaCommand } from 'execa';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  findFilesFromRepositoryRoot,
  getCommit,
  getCommittedFileCount,
  getNumberOfComitters,
  getRepositoryCreationDate,
  getSlug,
  getStorybookCreationDate,
  hasPreviousCommit,
  mergeQueueBranchMatch,
  NULL_BYTE,
} from './git';

vi.mock('execa');

const command = vi.mocked(execaCommand);

afterEach(() => {
  vi.clearAllMocks();
});

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
      committedAt: 1_696_588_814 * 1000,
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
      committedAt: 1_696_588_814 * 1000,
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

describe('hasPreviousCommit', () => {
  it('returns true if a commit is found', async () => {
    command.mockImplementation(
      () => Promise.resolve({ all: `19b6c9c5b3d34d9fc55627fcaf8a85bd5d5e5b2a` }) as any
    );
    expect(await hasPreviousCommit()).toEqual(true);
  });

  it('returns false if no commit is found', async () => {
    command.mockImplementation(() => Promise.resolve({ all: `` }) as any);
    expect(await hasPreviousCommit()).toEqual(false);
  });

  it('ignores gpg signature information', async () => {
    command.mockImplementation(
      () =>
        Promise.resolve({
          all: `
gpg: Signature made Fri Oct  6 12:40:14 2023 CEST
gpg:                using RSA key 4AEE18F83AFDEB23
gpg: Can't check signature: No public key
19b6c9c5b3d34d9fc55627fcaf8a85bd5d5e5b2a
          `.trim(),
        }) as any
    );
    expect(await hasPreviousCommit()).toEqual(true);
  });
});

describe('mergeQueueBranchMatch', () => {
  it('returns pr number if it is a merge queue branch', async () => {
    const branch = 'gh-readonly-queue/main/pr-4-da07417adc889156224d03a7466ac712c647cd36';
    expect(await mergeQueueBranchMatch(branch)).toEqual(4);
  });

  it('returns null if it is not a merge queue branch', async () => {
    const branch = 'develop';
    expect(await mergeQueueBranchMatch(branch)).toBeUndefined();
  });
});

describe('findFilesFromRepositoryRoot', () => {
  it('finds files relative to the repository root', async () => {
    const filesFound = ['package.json', 'another/package/package.json'];

    // first call from getRepositoryRoot()
    command.mockImplementationOnce(
      () =>
        Promise.resolve({
          all: '/root',
        }) as any
    );

    command.mockImplementationOnce(
      () =>
        Promise.resolve({
          all: filesFound.join(NULL_BYTE),
        }) as any
    );

    const results = await findFilesFromRepositoryRoot('package.json', '**/package.json');

    expect(command).toBeCalledTimes(2);
    expect(command).toHaveBeenNthCalledWith(
      2,
      'git ls-files --full-name -z "/root/package.json" "/root/**/package.json"',
      expect.any(Object)
    );
    expect(results).toEqual(filesFound);
  });
});

describe('getRepositoryCreationDate', () => {
  it('parses the date successfully', async () => {
    command.mockImplementation(() => Promise.resolve({ all: `2017-05-17 10:00:35 -0700` }) as any);
    expect(await getRepositoryCreationDate()).toEqual(new Date('2017-05-17T17:00:35.000Z'));
  });
});

describe('getStorybookCreationDate', () => {
  it('passes the config dir to the git command', async () => {
    await getStorybookCreationDate({ options: { storybookConfigDir: 'special-config-dir' } });
    expect(command).toHaveBeenCalledWith(
      expect.stringMatching(/special-config-dir/),
      expect.anything()
    );
  });

  it('defaults the config dir to the git command', async () => {
    await getStorybookCreationDate({ options: {} });
    expect(command).toHaveBeenCalledWith(expect.stringMatching(/.storybook/), expect.anything());
  });

  it('parses the date successfully', async () => {
    command.mockImplementation(() => Promise.resolve({ all: `2017-05-17 10:00:35 -0700` }) as any);
    expect(
      await getStorybookCreationDate({ options: { storybookConfigDir: '.storybook' } })
    ).toEqual(new Date('2017-05-17T17:00:35.000Z'));
  });
});

describe('getNumberOfComitters', () => {
  it('parses the count successfully', async () => {
    command.mockImplementation(() => Promise.resolve({ all: `      17` }) as any);
    expect(await getNumberOfComitters()).toEqual(17);
  });
});

describe('getCommittedFileCount', () => {
  it('constructs the correct command', async () => {
    await getCommittedFileCount(['page', 'screen'], ['js', 'ts']);
    expect(command).toHaveBeenCalledWith(
      'git ls-files -- "*page*.js" "*page*.ts" "*Page*.js" "*Page*.ts" "*screen*.js" "*screen*.ts" "*Screen*.js" "*Screen*.ts" | wc -l',
      expect.anything()
    );
  });
  it('parses the count successfully', async () => {
    command.mockImplementation(() => Promise.resolve({ all: `      17` }) as any);
    expect(await getCommittedFileCount(['page', 'screen'], ['js', 'ts'])).toEqual(17);
  });
});
