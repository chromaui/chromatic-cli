import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getChangedFilesWithReplacement } from './getChangedFilesWithReplacement';
import TestLogger from '../lib/testLogger';

vi.mock('./git', () => ({
  getChangedFiles: (hash) => {
    if (hash.match(/exists/)) return ['changed', 'files'];
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
      })
    ).toEqual({
      changedFiles: ['changed', 'files'],
      replacementBuild,
    });

    expect(client.runQuery).toHaveBeenCalled();
  });

  it('uses a replacement when build has uncommitted changes', async () => {
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
      })
    ).toEqual({
      changedFiles: ['changed', 'files'],
      replacementBuild,
    });

    expect(client.runQuery).toHaveBeenCalled();
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
      })
    ).rejects.toThrow(/fatal: bad object missing/);
  });
});
