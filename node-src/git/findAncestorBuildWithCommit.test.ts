import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AncestorBuildsQueryResult,
  findAncestorBuildWithCommit,
} from './findAncestorBuildWithCommit';

vi.mock('./git', () => ({
  commitExists: (hash) => hash.match(/exists/),
}));

type Build = AncestorBuildsQueryResult['app']['build']['ancestorBuilds'][0];
const makeBuild = (build: Partial<Build> = {}): Build => ({
  id: 'id',
  number: 1,
  commit: 'missing',
  uncommittedHash: '',
  isLocalBuild: false,
  ...build,
});
const makeResult = (ancestorBuilds: Build[]): AncestorBuildsQueryResult => ({
  app: { build: { ancestorBuilds } },
});

describe('findAncestorBuildWithCommit', () => {
  const client = { runQuery: vi.fn() } as any;
  beforeEach(() => {
    client.runQuery.mockReset();
  });

  it('returns a result in the first list of results', async () => {
    const toFind = makeBuild({ number: 3, commit: 'exists' });
    client.runQuery.mockReturnValue(makeResult([makeBuild(), makeBuild(), toFind]));

    expect(await findAncestorBuildWithCommit({ client }, 1)).toEqual(toFind);
    expect(client.runQuery).toHaveBeenCalledTimes(1);
    expect(client.runQuery.mock.calls[0][1]).toMatchObject({ buildNumber: 1 });
  });

  it('does not return a local build with uncommitted changes', async () => {
    client.runQuery.mockReturnValue(
      makeResult([makeBuild({ commit: 'exists', uncommittedHash: 'abc123', isLocalBuild: true })])
    );

    expect(await findAncestorBuildWithCommit({ client }, 1, { page: 1, limit: 1 })).toBeNull();
  });

  it('DOES return a CI build with uncommitted changes', async () => {
    client.runQuery.mockReturnValue(
      makeResult([makeBuild({ commit: 'exists', uncommittedHash: 'abc123' })])
    );

    expect(await findAncestorBuildWithCommit({ client }, 1, { page: 1, limit: 1 })).toMatchObject({
      commit: 'exists',
    });
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

  it('stops querying when the results run out', async () => {
    client.runQuery.mockReturnValueOnce(makeResult([makeBuild()]));

    expect(await findAncestorBuildWithCommit({ client }, 1, { page: 2, limit: 3 })).toBeNull();
    expect(client.runQuery).toHaveBeenCalledTimes(1);
  });
});
