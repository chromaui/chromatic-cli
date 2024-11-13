import { afterEach, describe, expect, it, vi } from 'vitest';

import * as execGit from './execGit';
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

vi.mock('./execGit');

const execGitCommand = vi.mocked(execGit.execGitCommand);
const execGitCommandOneLine = vi.mocked(execGit.execGitCommandOneLine);

afterEach(() => {
  vi.clearAllMocks();
});

describe('getCommit', () => {
  it('parses log output', async () => {
    execGitCommand.mockResolvedValue(
      `19b6c9c5b3d34d9fc55627fcaf8a85bd5d5e5b2a ## 1696588814 ## info@ghengeveld.nl ## Gert Hengeveld`
    );
    expect(await getCommit()).toEqual({
      commit: '19b6c9c5b3d34d9fc55627fcaf8a85bd5d5e5b2a',
      committedAt: 1_696_588_814 * 1000,
      committerEmail: 'info@ghengeveld.nl',
      committerName: 'Gert Hengeveld',
    });
  });

  it('ignores gpg signature information', async () => {
    execGitCommand.mockResolvedValue(
      `gpg: Signature made Fri Oct  6 12:40:14 2023 CEST
gpg:                using RSA key 4AEE18F83AFDEB23
gpg: Can't check signature: No public key
19b6c9c5b3d34d9fc55627fcaf8a85bd5d5e5b2a ## 1696588814 ## info@ghengeveld.nl ## Gert Hengeveld`.trim()
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
    execGitCommand.mockResolvedValue('git@github.com:chromaui/chromatic-cli.git');
    expect(await getSlug()).toBe('chromaui/chromatic-cli');

    execGitCommand.mockResolvedValue('https://github.com/chromaui/chromatic-cli');
    expect(await getSlug()).toBe('chromaui/chromatic-cli');

    execGitCommand.mockResolvedValue('https://gitlab.com/foo/bar.baz.git');
    expect(await getSlug()).toBe('foo/bar.baz');
  });
});

describe('hasPreviousCommit', () => {
  it('returns true if a commit is found', async () => {
    execGitCommand.mockResolvedValue(`19b6c9c5b3d34d9fc55627fcaf8a85bd5d5e5b2a`);
    expect(await hasPreviousCommit()).toEqual(true);
  });

  it('returns false if no commit is found', async () => {
    execGitCommand.mockResolvedValue(``);
    expect(await hasPreviousCommit()).toEqual(false);
  });

  it('ignores gpg signature information', async () => {
    execGitCommand.mockResolvedValue(
      `
gpg: Signature made Fri Oct  6 12:40:14 2023 CEST
gpg:                using RSA key 4AEE18F83AFDEB23
gpg: Can't check signature: No public key
19b6c9c5b3d34d9fc55627fcaf8a85bd5d5e5b2a`.trim()
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
    execGitCommand.mockResolvedValueOnce('/root');
    execGitCommand.mockResolvedValueOnce(filesFound.join(NULL_BYTE));

    const results = await findFilesFromRepositoryRoot('package.json', '**/package.json');

    expect(execGitCommand).toBeCalledTimes(2);
    expect(execGitCommand).toHaveBeenNthCalledWith(
      2,
      'git ls-files --full-name -z "/root/package.json" "/root/**/package.json"'
    );
    expect(results).toEqual(filesFound);
  });
});

describe('getRepositoryCreationDate', () => {
  it('parses the date successfully', async () => {
    execGitCommandOneLine.mockResolvedValue(`2017-05-17 10:00:35 -0700`);
    expect(await getRepositoryCreationDate()).toEqual(new Date('2017-05-17T17:00:35.000Z'));
  });
});

describe('getStorybookCreationDate', () => {
  it('passes the config dir to the git command', async () => {
    await getStorybookCreationDate({ options: { storybookConfigDir: 'special-config-dir' } });
    expect(execGitCommandOneLine).toHaveBeenCalledWith(
      expect.stringMatching(/special-config-dir/),
      expect.anything()
    );
  });

  it('defaults the config dir to the git command', async () => {
    await getStorybookCreationDate({ options: {} });
    expect(execGitCommandOneLine).toHaveBeenCalledWith(
      expect.stringMatching(/.storybook/),
      expect.anything()
    );
  });

  it('parses the date successfully', async () => {
    execGitCommandOneLine.mockResolvedValue(`2017-05-17 10:00:35 -0700`);
    expect(
      await getStorybookCreationDate({ options: { storybookConfigDir: '.storybook' } })
    ).toEqual(new Date('2017-05-17T17:00:35.000Z'));
  });
});

describe('getNumberOfComitters', () => {
  it('parses the count successfully', async () => {
    execGitCommand.mockResolvedValue(`tom\nzol\ndom`);
    expect(await getNumberOfComitters()).toEqual(3);
  });
});

describe('getCommittedFileCount', () => {
  it('constructs the correct command', async () => {
    await getCommittedFileCount(['page', 'screen'], ['js', 'ts']);
    expect(execGitCommand).toHaveBeenCalledWith(
      'git ls-files -- "*page*.js" "*page*.ts" "*Page*.js" "*Page*.ts" "*screen*.js" "*screen*.ts" "*Screen*.js" "*Screen*.ts"'
    );
  });
  it('parses the count successfully', async () => {
    execGitCommand.mockResolvedValue(`pages/Main.ts\npages/Pricing.ts\npagesLogin.ts`);
    expect(await getCommittedFileCount(['page', 'screen'], ['js', 'ts'])).toEqual(3);
  });
});
