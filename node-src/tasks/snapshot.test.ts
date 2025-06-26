import waitForBuildToComplete, {
  NotifyConnectionError,
  NotifyServiceError,
  NotifyServiceMessageTimeoutError,
} from '@cli/waitForBuildToComplete';
import * as Sentry from '@sentry/node';
import { describe, expect, it, vi } from 'vitest';

import { takeSnapshots } from './snapshot';

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
}));

vi.mock(import('@cli/waitForBuildToComplete'), async (importOriginal) => {
  const originalModule = await importOriginal();
  // returning a partial mock: mocked default function, but original NotifyServiceError and NotifyConnectionError
  return {
    ...originalModule,
    default: vi.fn(),
  };
});

const environment = {
  CHROMATIC_POLL_INTERVAL: 0,
  CHROMATIC_OUTPUT_INTERVAL: 0,
  CHROMATIC_NOTIFY_SERVICE_URL: 'wss://test.com',
};
const log = { error: vi.fn(), info: vi.fn(), debug: vi.fn() };
const matchesBranch = () => false;

const mockWaitForBuildToComplete = vi.mocked(waitForBuildToComplete);

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

  it('calls waitForBuildToComplete with correct arguments', async () => {
    const client = { runQuery: vi.fn(), setAuthorization: vi.fn() };
    const build = {
      app: { repository: { provider: 'github' } },
      number: 1,
      features: {},
      reportToken: 'report-token',
      id: 'build-123',
    };
    const ctx = {
      client,
      env: environment,
      git: { matchesBranch },
      log,
      options: {},
      build,
    } as any;

    mockWaitForBuildToComplete.mockResolvedValue();
    client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 0, status: 'PASSED', completedAt: 1 } },
    });

    await takeSnapshots(ctx, {} as any);

    expect(mockWaitForBuildToComplete).toHaveBeenCalledWith({
      notifyServiceUrl: environment.CHROMATIC_NOTIFY_SERVICE_URL,
      buildId: 'build-123',
      progressMessageCallback: expect.any(Function),
      log: ctx.log,
    });
  });

  it('handles NotifyConnectionError gracefully and continues execution', async () => {
    const client = { runQuery: vi.fn(), setAuthorization: vi.fn() };
    const build = {
      app: { repository: { provider: 'github' } },
      number: 1,
      features: {},
      reportToken: 'report-token',
      id: 'build-123',
    };
    const ctx = {
      client,
      env: environment,
      git: { matchesBranch },
      log,
      options: {},
      build,
    } as any;

    const connectionError = new NotifyConnectionError('Failed to connect to notify service', 1006);
    mockWaitForBuildToComplete.mockRejectedValue(connectionError);
    client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 0, status: 'PASSED', completedAt: 1 } },
    });

    await takeSnapshots(ctx, {} as any);

    expect(log.error).toHaveBeenCalledWith(
      'Failed to connect to notify service, falling back to polling'
    );
    expect(ctx.build).toEqual({ ...build, changeCount: 0, status: 'PASSED', completedAt: 1 });
    expect(ctx.exitCode).toBe(0);
  });

  it('handles NotifyServiceError gracefully and continues execution', async () => {
    const client = { runQuery: vi.fn(), setAuthorization: vi.fn() };
    const build = {
      app: { repository: { provider: 'github' } },
      number: 1,
      features: {},
      reportToken: 'report-token',
      id: 'build-123',
    };
    const ctx = {
      client,
      env: environment,
      git: { matchesBranch },
      log,
      options: {},
      build,
    } as any;

    const notifyError = new NotifyServiceError(
      'Connection failed',
      1001,
      'Going away',
      new Error('Original error')
    );
    mockWaitForBuildToComplete.mockRejectedValue(notifyError);
    client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 0, status: 'PASSED', completedAt: 1 } },
    });

    await takeSnapshots(ctx, {} as any);

    expect(log.error).toHaveBeenCalledWith(
      'Error getting updates from notify service: Connection failed code: 1001, reason: Going away, original error: Original error'
    );
    expect(ctx.build).toEqual({ ...build, changeCount: 0, status: 'PASSED', completedAt: 1 });
    expect(ctx.exitCode).toBe(0);
  });

  it('handles NotifyServiceMessageTimeoutError gracefully and continues execution', async () => {
    const client = { runQuery: vi.fn(), setAuthorization: vi.fn() };
    const build = {
      app: { repository: { provider: 'github' } },
      number: 1,
      features: {},
      reportToken: 'report-token',
      id: 'build-123',
    };
    const ctx = {
      client,
      env: environment,
      git: { matchesBranch },
      log,
      options: {},
      build,
    } as any;

    const timeoutError = new NotifyServiceMessageTimeoutError(
      'Timed out waiting for message',
      408,
      '408 Request Timeout'
    );
    mockWaitForBuildToComplete.mockRejectedValue(timeoutError);
    client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 0, status: 'PASSED', completedAt: 1 } },
    });

    await takeSnapshots(ctx, {} as any);

    expect(log.error).toHaveBeenCalledWith(
      'Timed out waiting for message from notify service, falling back to polling'
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(timeoutError);
    expect(ctx.build).toEqual({ ...build, changeCount: 0, status: 'PASSED', completedAt: 1 });
    expect(ctx.exitCode).toBe(0);
  });

  it('handles generic errors gracefully and continues execution', async () => {
    const client = { runQuery: vi.fn(), setAuthorization: vi.fn() };
    const build = {
      app: { repository: { provider: 'github' } },
      number: 1,
      features: {},
      reportToken: 'report-token',
      id: 'build-123',
    };
    const ctx = {
      client,
      env: environment,
      git: { matchesBranch },
      log,
      options: {},
      build,
    } as any;

    const genericError = new Error('Generic connection error');
    mockWaitForBuildToComplete.mockRejectedValue(genericError);
    client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 0, status: 'PASSED', completedAt: 1 } },
    });

    await takeSnapshots(ctx, {} as any);

    expect(log.error).toHaveBeenCalledWith(
      'Unexpected error from notify service: Generic connection error'
    );
    expect(ctx.build).toEqual({ ...build, changeCount: 0, status: 'PASSED', completedAt: 1 });
    expect(ctx.exitCode).toBe(0);
  });

  it('calls experimental_onTaskProgress via waitForBuildToComplete progress callback', async () => {
    const client = { runQuery: vi.fn(), setAuthorization: vi.fn() };
    const build = {
      app: { repository: { provider: 'github' } },
      number: 1,
      features: {},
      reportToken: 'report-token',
      actualTestCount: 5,
      id: 'build-123',
    };
    const ctx = {
      client,
      env: environment,
      git: { matchesBranch },
      log,
      options: { experimental_onTaskProgress: vi.fn() },
      build,
    } as any;

    let progressCallback: any;
    mockWaitForBuildToComplete.mockImplementation(({ progressMessageCallback }) => {
      progressCallback = progressMessageCallback;
      return Promise.resolve();
    });
    client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 0, status: 'PASSED', completedAt: 1 } },
    });

    await takeSnapshots(ctx, {} as any);

    // Simulate progress messages through the callback
    progressCallback({ inProgressCount: 3, status: 'IN_PROGRESS' });
    progressCallback({ inProgressCount: 1, status: 'IN_PROGRESS' });

    expect(ctx.options.experimental_onTaskProgress).toHaveBeenCalledTimes(2);
    expect(ctx.options.experimental_onTaskProgress).toHaveBeenCalledWith(expect.any(Object), {
      progress: 3, // actualTestCount (5) - inProgressCount (3) + 1 = 3
      total: 5,
      unit: 'snapshots',
    });
    expect(ctx.options.experimental_onTaskProgress).toHaveBeenCalledWith(expect.any(Object), {
      progress: 5, // actualTestCount (5) - inProgressCount (1) + 1 = 5
      total: 5,
      unit: 'snapshots',
    });
  });
});
