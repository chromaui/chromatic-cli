import { describe, expect, it, vi } from 'vitest';

import { takeSnapshots } from './snapshot';

const environment = { CHROMATIC_POLL_INTERVAL: 0, CHROMATIC_OUTPUT_INTERVAL: 0 };
const log = { error: vi.fn(), info: vi.fn() };
const matchesBranch = () => false;

describe('takeSnapshots', () => {
  it('waits for the build to complete and sets it on context', async () => {
    const client = { runQuery: vi.fn(), setAuthorization: vi.fn() };
    const build = {
      app: { repository: { provider: 'github' } },
      number: 1,
      features: {},
      reportToken: 'report-token',
    };
    const ctx = {
      client,
      env: environment,
      git: { matchesBranch },
      log,
      options: {},
      build,
    } as any;

    client.runQuery.mockReturnValueOnce({ app: { build: { status: 'IN_PROGRESS' } } });
    client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 0, status: 'PASSED', completedAt: 1 } },
    });

    await takeSnapshots(ctx, {} as any);
    expect(client.runQuery).toHaveBeenCalledWith(
      expect.stringMatching(/SnapshotBuildQuery/),
      { number: 1 },
      { headers: { Authorization: `Bearer report-token` } }
    );
    expect(client.runQuery).toHaveBeenCalledTimes(2);
    expect(ctx.build).toEqual({ ...build, changeCount: 0, status: 'PASSED', completedAt: 1 });
    expect(ctx.exitCode).toBe(0);
  });

  it('sets exitCode to 1 when build has changes', async () => {
    const client = { runQuery: vi.fn(), setAuthorization: vi.fn() };
    const build = { app: { repository: { provider: 'github' } }, number: 1, features: {} };
    const ctx = {
      client,
      env: environment,
      git: { matchesBranch },
      log,
      options: {},
      build,
      announcedBuild: build,
    } as any;

    client.runQuery.mockReturnValueOnce({ app: { build: { status: 'IN_PROGRESS' } } });
    client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 2, status: 'PENDING', completedAt: 1 } },
    });

    await takeSnapshots(ctx, {} as any);
    expect(ctx.build).toEqual({ ...build, changeCount: 2, status: 'PENDING', completedAt: 1 });
    expect(ctx.exitCode).toBe(1);
  });

  it('sets exitCode to 0 when build has changes but --exit-zero-on-changes is set with `true` string', async () => {
    const client = { runQuery: vi.fn(), setAuthorization: vi.fn() };
    const build = { app: { repository: { provider: 'github' } }, number: 1, features: {} };
    const ctx = {
      client,
      env: environment,
      git: { matchesBranch },
      log,
      options: {
        exitZeroOnChanges: 'true',
      },
      build,
      announcedBuild: build,
    } as any;

    client.runQuery.mockReturnValueOnce({ app: { build: { status: 'IN_PROGRESS' } } });
    client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 2, status: 'PENDING', completedAt: 1 } },
    });

    await takeSnapshots(ctx, {} as any);
    expect(ctx.build).toEqual({ ...build, changeCount: 2, status: 'PENDING', completedAt: 1 });
    expect(ctx.exitCode).toBe(0);
  });

  it('sets exitCode to 2 when build is broken (capture error)', async () => {
    const client = { runQuery: vi.fn(), setAuthorization: vi.fn() };
    const build = { app: { repository: { provider: 'github' } }, number: 1, features: {} };
    const ctx = {
      client,
      env: environment,
      git: { matchesBranch },
      log,
      options: {},
      build,
      announcedBuild: build,
    } as any;

    client.runQuery.mockReturnValueOnce({ app: { build: { status: 'IN_PROGRESS' } } });
    client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 2, status: 'BROKEN', completedAt: 1 } },
    });

    await takeSnapshots(ctx, {} as any);
    expect(ctx.build).toEqual({ ...build, changeCount: 2, status: 'BROKEN', completedAt: 1 });
    expect(ctx.exitCode).toBe(2);
  });

  it('sets exitCode to 3 when build fails (system error)', async () => {
    const client = { runQuery: vi.fn(), setAuthorization: vi.fn() };
    const build = { app: { repository: { provider: 'github' } }, number: 1, features: {} };
    const ctx = {
      client,
      env: environment,
      git: { matchesBranch },
      log,
      options: {},
      build,
      announcedBuild: build,
    } as any;

    client.runQuery.mockReturnValueOnce({ app: { build: { status: 'IN_PROGRESS' } } });
    client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 2, status: 'FAILED', completedAt: 1 } },
    });

    await takeSnapshots(ctx, {} as any);
    expect(ctx.build).toEqual({ ...build, changeCount: 2, status: 'FAILED', completedAt: 1 });
    expect(ctx.exitCode).toBe(3);
  });

  it('calls experimental_onTaskProgress with progress', async () => {
    const client = { runQuery: vi.fn(), setAuthorization: vi.fn() };
    const build = {
      app: { repository: { provider: 'github' } },
      number: 1,
      features: {},
      reportToken: 'report-token',
      actualTestCount: 5,
      inProgressCount: 5,
    };
    const ctx = {
      client,
      env: environment,
      git: { matchesBranch },
      log,
      options: { experimental_onTaskProgress: vi.fn() },
      build,
    } as any;

    client.runQuery.mockReturnValueOnce({
      app: { build: { status: 'IN_PROGRESS', inProgressCount: 5 } },
    });
    client.runQuery.mockReturnValueOnce({
      app: { build: { status: 'IN_PROGRESS', inProgressCount: 3 } },
    });
    client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 0, status: 'PASSED', completedAt: 1, inProgressCount: 0 } },
    });

    await takeSnapshots(ctx, {} as any);

    expect(ctx.options.experimental_onTaskProgress).toHaveBeenCalledTimes(2);
    expect(ctx.options.experimental_onTaskProgress).toHaveBeenCalledWith(expect.any(Object), {
      progress: 1,
      total: 5,
      unit: 'snapshots',
    });
    expect(ctx.options.experimental_onTaskProgress).toHaveBeenCalledWith(expect.any(Object), {
      progress: 3,
      total: 5,
      unit: 'snapshots',
    });
  });
});
