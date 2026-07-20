import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HTTPClientError } from '../io/httpClient';
import TestLogger from '../lib/testLogger';
import { NetworkError, ReplacementFailedError } from '../lib/turbosnap/1.0/errors';
import {
  AncestorBuildsQueryResult,
  findAncestorBuildWithCommit,
} from './findAncestorBuildWithCommit';
import * as gitModule from './git';

vi.mock('./git', () => ({
  commitExists: vi.fn((_, hash) => hash.match(/exists/)),
}));

const commitExists = vi.mocked(gitModule.commitExists);

const ctx = { log: new TestLogger() };

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

    expect(await findAncestorBuildWithCommit({ ...ctx, client }, 1)).toEqual(toFind);
    expect(client.runQuery).toHaveBeenCalledTimes(1);
    expect(client.runQuery.mock.calls[0][1]).toMatchObject({ buildNumber: 1 });
  });

  it('does not return a local build with uncommitted changes', async () => {
    client.runQuery.mockReturnValue(
      makeResult([makeBuild({ commit: 'exists', uncommittedHash: 'abc123', isLocalBuild: true })])
    );

    expect(
      await findAncestorBuildWithCommit({ ...ctx, client }, 1, { page: 1, limit: 1 })
    ).toBeUndefined();
  });

  it('DOES return a CI build with uncommitted changes', async () => {
    client.runQuery.mockReturnValue(
      makeResult([makeBuild({ commit: 'exists', uncommittedHash: 'abc123' })])
    );

    expect(
      await findAncestorBuildWithCommit({ ...ctx, client }, 1, { page: 1, limit: 1 })
    ).toMatchObject({
      commit: 'exists',
    });
  });

  it('passes skip and limit and recurse', async () => {
    const toFind = makeBuild({ number: 3, commit: 'exists' });
    client.runQuery
      .mockReturnValueOnce(makeResult([makeBuild(), makeBuild()]))
      .mockReturnValueOnce(makeResult([makeBuild(), toFind]));

    expect(
      await findAncestorBuildWithCommit({ ...ctx, client }, 1, { page: 2, limit: 100 })
    ).toEqual(toFind);
    expect(client.runQuery).toHaveBeenCalledTimes(2);
    expect(client.runQuery.mock.calls[0][1]).toMatchObject({ buildNumber: 1, skip: 0, limit: 2 });
    expect(client.runQuery.mock.calls[1][1]).toMatchObject({ buildNumber: 1, skip: 2, limit: 2 });
  });

  it('bails out if we go past a limit', async () => {
    client.runQuery
      .mockReturnValueOnce(makeResult([makeBuild(), makeBuild()]))
      .mockReturnValueOnce(makeResult([makeBuild(), makeBuild()]));

    expect(
      await findAncestorBuildWithCommit({ ...ctx, client }, 1, { page: 2, limit: 3 })
    ).toBeUndefined();
    expect(client.runQuery).toHaveBeenCalledTimes(2);
    expect(client.runQuery.mock.calls[0][1]).toMatchObject({ buildNumber: 1, skip: 0, limit: 2 });
    expect(client.runQuery.mock.calls[1][1]).toMatchObject({ buildNumber: 1, skip: 2, limit: 1 });
  });

  it('stops querying when the results run out', async () => {
    client.runQuery.mockReturnValueOnce(makeResult([makeBuild()]));

    expect(
      await findAncestorBuildWithCommit({ ...ctx, client }, 1, { page: 2, limit: 3 })
    ).toBeUndefined();
    expect(client.runQuery).toHaveBeenCalledTimes(1);
  });
});

const buildContext = () => {
  const runQuery = vi.fn();
  return {
    client: { runQuery },
    log: new TestLogger(),
  } as any;
};

describe('findAncestorBuildWithCommit error wrapping', () => {
  beforeEach(() => {
    commitExists.mockResolvedValue(false);
  });

  it('throws NetworkError when runQuery rejects with HTTPClientError', async () => {
    const ctx = buildContext();
    const cause = new HTTPClientError({ url: 'x', status: 500, statusText: 'x' } as any);
    ctx.client.runQuery.mockRejectedValueOnce(cause);

    let err;
    try {
      await findAncestorBuildWithCommit(ctx, 7);
    } catch (error) {
      err = error;
    }

    expect(err).toBeInstanceOf(NetworkError);
    expect(err).toMatchObject({ cause });
  });

  it('throws NetworkError when runQuery rejects with a FetchError-shaped error', async () => {
    const ctx = buildContext();
    const cause = Object.assign(new Error('fetch failed'), {
      name: 'FetchError',
      code: 'ENOTFOUND',
    });
    ctx.client.runQuery.mockRejectedValueOnce(cause);

    let err;
    try {
      await findAncestorBuildWithCommit(ctx, 7);
    } catch (error) {
      err = error;
    }

    expect(err).toBeInstanceOf(NetworkError);
    expect(err).toMatchObject({ cause });
  });

  it('throws ReplacementFailedError for any other rejection', async () => {
    const ctx = buildContext();
    const cause = { message: 'GraphQL error', extensions: { code: 'BAD_USER_INPUT' } };
    ctx.client.runQuery.mockRejectedValueOnce(cause);

    let err;
    try {
      await findAncestorBuildWithCommit(ctx, 7);
    } catch (error) {
      err = error;
    }

    expect(err).toBeInstanceOf(ReplacementFailedError);
    expect(err).toMatchObject({ cause });
  });
});
