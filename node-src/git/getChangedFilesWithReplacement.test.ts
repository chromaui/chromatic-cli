import { beforeEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../lib/testLogger';
import { AncestorMissingError, BaselineDirtyError, GitCommandError } from '../lib/turbosnap/errors';
import { getChangedFilesWithReplacement } from './getChangedFilesWithReplacement';
import * as gitModule from './git';

vi.mock('./git', () => ({
  getChangedFiles: vi.fn((_: unknown, hash: string) => {
    if (/exists/.test(hash)) return ['changed', 'files'];
    throw new AncestorMissingError(hash, { cause: new Error(`fatal: bad object ${hash}`) });
  }),
  commitExists: vi.fn((_: unknown, hash: string) => /exists/.test(hash)),
}));

const mockedGetChangedFiles = vi.mocked(gitModule.getChangedFiles);

describe('getChangedFilesWithReplacements', () => {
  const client = { runQuery: vi.fn() } as any;
  beforeEach(() => {
    client.runQuery.mockReset();
  });
  const context = { client, log: new TestLogger() } as any;

  it('passes changedFiles on through on the happy path', async () => {
    expect(
      await getChangedFilesWithReplacement(context, {
        id: 'id',
        number: 3,
        commit: 'exists',
        uncommittedHash: '',
        isLocalBuild: false,
      })
    ).toEqual({
      changedFiles: ['changed', 'files'],
    });

    expect(client.runQuery).not.toHaveBeenCalled();
  });

  it('uses a replacement when build has missing commit', async () => {
    const replacementBuild = {
      id: 'replacement',
      number: 2,
      commit: 'exists',
      uncommittedHash: '',
    };
    client.runQuery.mockReturnValue({ app: { build: { ancestorBuilds: [replacementBuild] } } });

    expect(
      await getChangedFilesWithReplacement(context, {
        id: 'id',
        number: 3,
        commit: 'missing',
        uncommittedHash: '',
        isLocalBuild: false,
      })
    ).toEqual({
      changedFiles: ['changed', 'files'],
      replacementBuild,
    });

    expect(client.runQuery).toHaveBeenCalled();
  });

  it('uses a replacement when local build has uncommitted changes', async () => {
    const replacementBuild = {
      id: 'replacement',
      number: 2,
      commit: 'exists',
      uncommittedHash: '',
    };
    client.runQuery.mockReturnValue({ app: { build: { ancestorBuilds: [replacementBuild] } } });

    expect(
      await getChangedFilesWithReplacement(context, {
        id: 'id',
        number: 3,
        commit: 'exists',
        uncommittedHash: 'abcdef',
        isLocalBuild: true,
      })
    ).toEqual({
      changedFiles: ['changed', 'files'],
      replacementBuild,
    });

    expect(client.runQuery).toHaveBeenCalled();
  });

  it('does not use a replacement when non-local build has uncommitted changes', async () => {
    const replacementBuild = {
      id: 'replacement',
      number: 2,
      commit: 'exists',
      uncommittedHash: '',
    };
    client.runQuery.mockReturnValue({ app: { build: { ancestorBuilds: [replacementBuild] } } });

    expect(
      await getChangedFilesWithReplacement(context, {
        id: 'id',
        number: 3,
        commit: 'exists',
        uncommittedHash: 'abcdef',
        isLocalBuild: false,
      })
    ).toEqual({
      changedFiles: ['changed', 'files'],
    });
  });

  it('throws AncestorMissingError if there is no replacement', async () => {
    const replacementBuild = {
      id: 'replacement',
      number: 2,
      commit: 'also-missing',
      uncommittedHash: '',
    };
    client.runQuery.mockReturnValue({ app: { build: { ancestorBuilds: [replacementBuild] } } });

    let err;
    try {
      await getChangedFilesWithReplacement(context, {
        id: 'id',
        number: 3,
        commit: 'missing',
        uncommittedHash: '',
        isLocalBuild: false,
      });
    } catch (error) {
      err = error;
    }

    expect(err).toBeInstanceOf(AncestorMissingError);
    expect(err).toMatchObject({ commit: 'missing' });
  });

  it('throws BaselineDirtyError when a local build with uncommitted changes has no replacement', async () => {
    client.runQuery.mockReturnValue({ app: { build: { ancestorBuilds: [] } } });

    let err;
    try {
      await getChangedFilesWithReplacement(context, {
        id: 'id',
        number: 3,
        commit: 'exists',
        uncommittedHash: 'abcdef',
        isLocalBuild: true,
      });
    } catch (error) {
      err = error;
    }

    expect(err).toBeInstanceOf(BaselineDirtyError);
    expect(err).toMatchObject({ commit: 'exists' });
  });

  it('rethrows unknown errors', async () => {
    mockedGetChangedFiles.mockImplementationOnce(() => {
      throw new GitCommandError('git diff', { cause: new Error('git broken') });
    });

    let err;
    try {
      await getChangedFilesWithReplacement(context, {
        id: 'id',
        number: 3,
        commit: 'exists',
        uncommittedHash: '',
        isLocalBuild: false,
      });
    } catch (error) {
      err = error;
    }

    expect(err).toBeInstanceOf(GitCommandError);
    expect(client.runQuery).not.toHaveBeenCalled();
  });
});
