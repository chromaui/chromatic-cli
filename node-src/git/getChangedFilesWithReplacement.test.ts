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
  const getAncestorBuilds = vi.fn();
  const commitExists = vi.fn(async (sha: string) => Boolean(/exists/.test(sha)));
  const ports = {
    chromatic: { getAncestorBuilds } as any,
    git: { commitExists } as any,
  };
  beforeEach(() => {
    getAncestorBuilds.mockReset();
  });
  const context = { log: new TestLogger(), ports } as any;

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

    expect(getAncestorBuilds).not.toHaveBeenCalled();
  });

  it('uses a replacement when build has missing commit', async () => {
    const replacementBuild = {
      id: 'replacement',
      number: 2,
      commit: 'exists',
      uncommittedHash: '',
    };
    getAncestorBuilds.mockReturnValue([replacementBuild]);

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

    expect(getAncestorBuilds).toHaveBeenCalled();
  });

  it('uses a replacement when local build has uncommitted changes', async () => {
    const replacementBuild = {
      id: 'replacement',
      number: 2,
      commit: 'exists',
      uncommittedHash: '',
    };
    getAncestorBuilds.mockReturnValue([replacementBuild]);

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

    expect(getAncestorBuilds).toHaveBeenCalled();
  });

  it('does not use a replacement when non-local build has uncommitted changes', async () => {
    const replacementBuild = {
      id: 'replacement',
      number: 2,
      commit: 'exists',
      uncommittedHash: '',
    };
    getAncestorBuilds.mockReturnValue([replacementBuild]);

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
    getAncestorBuilds.mockReturnValue([replacementBuild]);

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
