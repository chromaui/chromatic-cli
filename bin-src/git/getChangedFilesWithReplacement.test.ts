import { Context } from '../types';
import { AncestorBuildsQueryResult } from './findAncestorBuildWithCommit';
import { getChangedFilesWithReplacement } from './getChangedFilesWithReplacement';

jest.mock('./git', () => ({
  getChangedFiles: (hash) => {
    if (hash.match(/exists/)) return ['changed', 'files'];
    throw new Error(
      `fatal: ambiguous argument '${hash}': unknown revision or path not in the working tree.`
    );
  },
  commitExists: (hash) => hash.match(/exists/),
}));

describe('getChangedFilesWithReplacements', () => {
  const client = { runQuery: jest.fn() } as any;
  beforeEach(() => {
    client.runQuery.mockReset();
  });
  const context = { client } as Context;

  it('passes changedFiles on through on the happy path', async () => {
    expect(
      await getChangedFilesWithReplacement(context, { id: 'id', number: 3, commit: 'exists' })
    ).toEqual({
      changedFiles: ['changed', 'files'],
    });

    expect(client.runQuery).not.toHaveBeenCalled();
  });

  it('uses a replacement when there is one', async () => {
    const replacementBuild = { id: 'replacement', number: 2, commit: 'exists' };
    client.runQuery.mockReturnValue({ app: { build: { ancestorBuilds: [replacementBuild] } } });

    expect(
      await getChangedFilesWithReplacement(context, { id: 'id', number: 3, commit: 'missing' })
    ).toEqual({
      changedFiles: ['changed', 'files'],
      replacementBuild,
    });

    expect(client.runQuery).toHaveBeenCalled();
  });

  it('throws if there is no replacement', async () => {
    const replacementBuild = { id: 'replacement', number: 2, commit: 'also-missing' };
    client.runQuery.mockReturnValue({ app: { build: { ancestorBuilds: [replacementBuild] } } });

    await expect(
      getChangedFilesWithReplacement(context, { id: 'id', number: 3, commit: 'missing' })
    ).rejects.toThrow(
      /fatal: ambiguous argument 'missing': unknown revision or path not in the working tree/
    );
  });
});
