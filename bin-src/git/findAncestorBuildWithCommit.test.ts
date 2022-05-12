import {
  AncestorBuildsQueryResult,
  findAncestorBuildWithCommit,
} from './findAncestorBuildWithCommit';

jest.mock('./git', () => ({
  commitExists: (hash) => hash.match(/exists/),
}));

describe('findAncestorBuildWithCommit', () => {
  const client = { runQuery: jest.fn() } as any;
  beforeEach(() => {
    client.runQuery.mockReset();
  });

  type Build = AncestorBuildsQueryResult['app']['build']['ancestorBuilds'][0];
  const makeBuild = (build: Partial<Build> = {}): Build => ({
    id: 'id',
    number: 1,
    status: 'PASSED',
    commit: 'missing',
    committedAt: Date.now(),
    changeCount: 100,
    ...build,
  });
  const makeResult = (ancestorBuilds: Build[]): AncestorBuildsQueryResult => ({
    app: { build: { ancestorBuilds } },
  });
  it('returns a result in the first list of results', async () => {
    const toFind = makeBuild({ number: 3, commit: 'exists' });
    client.runQuery.mockReturnValue(makeResult([makeBuild(), makeBuild(), toFind]));

    expect(await findAncestorBuildWithCommit({ client }, 1)).toEqual(toFind);
    expect(client.runQuery).toHaveBeenCalledTimes(1);
    expect(client.runQuery.mock.calls[0][1]).toMatchObject({ buildNumber: 1 });
  });

  it('passes skip and limit and recurse', async () => {
    const toFind = makeBuild({ number: 3, commit: 'exists' });
    client.runQuery
      .mockReturnValueOnce(makeResult([makeBuild(), makeBuild()]))
      .mockReturnValueOnce(makeResult([makeBuild(), toFind]));

    expect(await findAncestorBuildWithCommit({ client }, 1, { page: 2, limit: 100 })).toEqual(
      toFind
    );
    expect(client.runQuery).toHaveBeenCalledTimes(2);
    expect(client.runQuery.mock.calls[0][1]).toMatchObject({ buildNumber: 1, skip: 0, limit: 2 });
    expect(client.runQuery.mock.calls[1][1]).toMatchObject({ buildNumber: 1, skip: 2, limit: 2 });
  });

  it('bails out if we go past a limit', async () => {
    client.runQuery
      .mockReturnValueOnce(makeResult([makeBuild(), makeBuild()]))
      .mockReturnValueOnce(makeResult([makeBuild(), makeBuild()]));

    expect(await findAncestorBuildWithCommit({ client }, 1, { page: 2, limit: 3 })).toBeNull();
    expect(client.runQuery).toHaveBeenCalledTimes(2);
    expect(client.runQuery.mock.calls[0][1]).toMatchObject({ buildNumber: 1, skip: 0, limit: 2 });
    expect(client.runQuery.mock.calls[1][1]).toMatchObject({ buildNumber: 1, skip: 2, limit: 1 });
  });
});
