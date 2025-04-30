import { beforeEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../lib/testLogger';
import { getChangedFilesWithReplacement } from './getChangedFilesWithReplacement';

vi.mock('./git', () => ({
  getChangedFiles: (hash) => {
    if (/exists/.test(hash)) return ['changed', 'files'];
    throw new Error(`fatal: bad object ${hash}`);
  },
  commitExists: (hash) => hash.match(/exists/),
}));

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

  it('throws if there is no replacement', async () => {
    const replacementBuild = {
      id: 'replacement',
      number: 2,
      commit: 'also-missing',
      uncommittedHash: '',
    };
    client.runQuery.mockReturnValue({ app: { build: { ancestorBuilds: [replacementBuild] } } });

    await expect(
      getChangedFilesWithReplacement(context, {
        id: 'id',
        number: 3,
        commit: 'missing',
        uncommittedHash: '',
        isLocalBuild: false,
      })
    ).rejects.toThrow(/fatal: bad object missing/);
  });

  it('tries multiple replacement builds until finding a working one', async () => {
    const failingBuild = {
      id: 'failing',
      number: 2,
      commit: 'failing',
      uncommittedHash: '',
    };
    const workingBuild = {
      id: 'working',
      number: 1,
      commit: 'exists',
      uncommittedHash: '',
    };
    client.runQuery
      .mockReturnValueOnce({ app: { build: { ancestorBuilds: [failingBuild] } } })
      .mockReturnValueOnce({ app: { build: { ancestorBuilds: [workingBuild] } } });

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
      replacementBuild: workingBuild,
    });

    expect(client.runQuery).toHaveBeenCalledTimes(2);
  });

  it('tries multiple replacement builds in the same batch', async () => {
    const failingBuild1 = {
      id: 'failing1',
      number: 2,
      commit: 'failing1',
      uncommittedHash: '',
    };
    const failingBuild2 = {
      id: 'failing2',
      number: 1,
      commit: 'failing2',
      uncommittedHash: '',
    };
    const workingBuild = {
      id: 'working',
      number: 0,
      commit: 'exists',
      uncommittedHash: '',
    };
    client.runQuery.mockReturnValue({
      app: { build: { ancestorBuilds: [failingBuild1, failingBuild2, workingBuild] } },
    });

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
      replacementBuild: workingBuild,
    });

    expect(client.runQuery).toHaveBeenCalledTimes(1);
  });

  it('throws if all replacement builds fail', async () => {
    const failingBuild1 = {
      id: 'failing1',
      number: 2,
      commit: 'failing1',
      uncommittedHash: '',
    };
    const failingBuild2 = {
      id: 'failing2',
      number: 1,
      commit: 'failing2',
      uncommittedHash: '',
    };
    client.runQuery.mockReturnValue({
      app: { build: { ancestorBuilds: [failingBuild1, failingBuild2] } },
    });

    await expect(
      getChangedFilesWithReplacement(context, {
        id: 'id',
        number: 3,
        commit: 'missing',
        uncommittedHash: '',
        isLocalBuild: false,
      })
    ).rejects.toThrow(/fatal: bad object missing/);

    expect(client.runQuery).toHaveBeenCalledTimes(1);
  });
});
