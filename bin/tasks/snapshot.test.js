import { takeSnapshots } from './snapshot';

const env = { CHROMATIC_POLL_INTERVAL: 0 };
const log = { error: jest.fn(), info: jest.fn() };
const matchesBranch = () => false;

describe('takeSnapshots', () => {
  it('retrieves the build from the index and sets it on context', async () => {
    const client = { runQuery: jest.fn(), setAuthorization: jest.fn() };
    const build = { app: { repository: { provider: 'github' } }, number: 1, features: {} };
    const ctx = { client, env, git: { matchesBranch }, log, options: {}, build };

    client.runQuery.mockReturnValueOnce({ app: { build: { status: 'IN_PROGRESS' } } });
    client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 0, status: 'PASSED' } },
    });

    await takeSnapshots(ctx, {});
    expect(client.runQuery).toHaveBeenCalledTimes(2);
    expect(client.runQuery).toHaveBeenCalledWith(expect.stringMatching(/TesterBuildQuery/), {
      buildNumber: 1,
    });
    expect(ctx.build).toEqual({ ...build, changeCount: 0, status: 'PASSED' });
    expect(ctx.exitCode).toBe(0);
  });

  it('sets exitCode to 1 when build has changes', async () => {
    const client = { runQuery: jest.fn(), setAuthorization: jest.fn() };
    const build = { app: { repository: { provider: 'github' } }, number: 1, features: {} };
    const ctx = { client, env, git: { matchesBranch }, log, options: {}, build };

    client.runQuery.mockReturnValueOnce({ app: { build: { status: 'IN_PROGRESS' } } });
    client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 2, status: 'PENDING' } },
    });

    await takeSnapshots(ctx, {});
    expect(ctx.build).toEqual({ ...build, changeCount: 2, status: 'PENDING' });
    expect(ctx.exitCode).toBe(1);
  });

  it('sets exitCode to 2 when build is broken (capture error)', async () => {
    const client = { runQuery: jest.fn(), setAuthorization: jest.fn() };
    const build = { app: { repository: { provider: 'github' } }, number: 1, features: {} };
    const ctx = { client, env, git: { matchesBranch }, log, options: {}, build };

    client.runQuery.mockReturnValueOnce({ app: { build: { status: 'IN_PROGRESS' } } });
    client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 2, status: 'BROKEN' } },
    });

    await takeSnapshots(ctx, {});
    expect(ctx.build).toEqual({ ...build, changeCount: 2, status: 'BROKEN' });
    expect(ctx.exitCode).toBe(2);
  });

  it('sets exitCode to 3 when build fails (system error)', async () => {
    const client = { runQuery: jest.fn(), setAuthorization: jest.fn() };
    const build = { app: { repository: { provider: 'github' } }, number: 1, features: {} };
    const ctx = { client, env, git: { matchesBranch }, log, options: {}, build };

    client.runQuery.mockReturnValueOnce({ app: { build: { status: 'IN_PROGRESS' } } });
    client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 2, status: 'FAILED' } },
    });

    await takeSnapshots(ctx, {});
    expect(ctx.build).toEqual({ ...build, changeCount: 2, status: 'FAILED' });
    expect(ctx.exitCode).toBe(3);
  });
});
