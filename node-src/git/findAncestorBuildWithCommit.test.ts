import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AncestorBuild } from '../lib/ports/chromaticApi';
import TestLogger from '../lib/testLogger';
import { findAncestorBuildWithCommit } from './findAncestorBuildWithCommit';

const getAncestorBuilds = vi.fn();
const commitExists = vi.fn(async (sha: string) => Boolean(/exists/.test(sha)));

const ports = {
  chromatic: { getAncestorBuilds } as any,
  git: { commitExists } as any,
};
const ctx = { log: new TestLogger(), ports } as any;

const makeBuild = (build: Partial<AncestorBuild> = {}): AncestorBuild => ({
  id: 'id',
  number: 1,
  commit: 'missing',
  uncommittedHash: '',
  isLocalBuild: false,
  ...build,
});

describe('findAncestorBuildWithCommit', () => {
  beforeEach(() => {
    getAncestorBuilds.mockReset();
  });

  it('returns a result in the first list of results', async () => {
    const toFind = makeBuild({ number: 3, commit: 'exists' });
    getAncestorBuilds.mockReturnValue([makeBuild(), makeBuild(), toFind]);

    expect(await findAncestorBuildWithCommit(ctx, 1)).toEqual(toFind);
    expect(getAncestorBuilds).toHaveBeenCalledTimes(1);
    expect(getAncestorBuilds.mock.calls[0][0]).toMatchObject({ buildNumber: 1 });
  });

  it('does not return a local build with uncommitted changes', async () => {
    getAncestorBuilds.mockReturnValue([
      makeBuild({ commit: 'exists', uncommittedHash: 'abc123', isLocalBuild: true }),
    ]);

    expect(await findAncestorBuildWithCommit(ctx, 1, { page: 1, limit: 1 })).toBeUndefined();
  });

  it('DOES return a CI build with uncommitted changes', async () => {
    getAncestorBuilds.mockReturnValue([makeBuild({ commit: 'exists', uncommittedHash: 'abc123' })]);

    expect(await findAncestorBuildWithCommit(ctx, 1, { page: 1, limit: 1 })).toMatchObject({
      commit: 'exists',
    });
  });

  it('passes skip and limit and recurse', async () => {
    const toFind = makeBuild({ number: 3, commit: 'exists' });
    getAncestorBuilds
      .mockReturnValueOnce([makeBuild(), makeBuild()])
      .mockReturnValueOnce([makeBuild(), toFind]);

    expect(await findAncestorBuildWithCommit(ctx, 1, { page: 2, limit: 100 })).toEqual(toFind);
    expect(getAncestorBuilds).toHaveBeenCalledTimes(2);
    expect(getAncestorBuilds.mock.calls[0][0]).toMatchObject({
      buildNumber: 1,
      skip: 0,
      limit: 2,
    });
    expect(getAncestorBuilds.mock.calls[1][0]).toMatchObject({
      buildNumber: 1,
      skip: 2,
      limit: 2,
    });
  });

  it('bails out if we go past a limit', async () => {
    getAncestorBuilds
      .mockReturnValueOnce([makeBuild(), makeBuild()])
      .mockReturnValueOnce([makeBuild(), makeBuild()]);

    expect(await findAncestorBuildWithCommit(ctx, 1, { page: 2, limit: 3 })).toBeUndefined();
    expect(getAncestorBuilds).toHaveBeenCalledTimes(2);
    expect(getAncestorBuilds.mock.calls[0][0]).toMatchObject({
      buildNumber: 1,
      skip: 0,
      limit: 2,
    });
    expect(getAncestorBuilds.mock.calls[1][0]).toMatchObject({
      buildNumber: 1,
      skip: 2,
      limit: 1,
    });
  });

  it('stops querying when the results run out', async () => {
    getAncestorBuilds.mockReturnValueOnce([makeBuild()]);

    expect(await findAncestorBuildWithCommit(ctx, 1, { page: 2, limit: 3 })).toBeUndefined();
    expect(getAncestorBuilds).toHaveBeenCalledTimes(1);
  });
});
