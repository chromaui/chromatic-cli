import { beforeEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../lib/testLogger';
import { getChangedFilesWithReplacement } from './getChangedFilesWithReplacement';

vi.mock('./git', () => ({
  getChangedFiles: (_, hash) => {
    if (/exists/.test(hash)) return ['changed', 'files'];
    throw new Error(`fatal: bad object ${hash}`);
  },
  commitExists: (_, hash) => hash.match(/exists/),
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
});
