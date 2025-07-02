import waitForBuildToComplete, {
  NotifyConnectionError,
  NotifyServiceAuthenticationError,
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

const createBaseTestContext = () => ({
  client: { runQuery: vi.fn(), setAuthorization: vi.fn() },
  env: environment,
  git: { matchesBranch },
  log,
  options: {},
});

const mockWaitForBuildToComplete = vi.mocked(waitForBuildToComplete);

describe('takeSnapshots', () => {
  it('waits for the build to complete and sets it on context', async () => {
    const build = {
      app: { repository: { provider: 'github' } },
      number: 1,
      features: {},
      reportToken: 'report-token',
    };
    const ctx = {
      ...createBaseTestContext(),
      build,
    } as any;

    ctx.client.runQuery.mockReturnValueOnce({ app: { build: { status: 'IN_PROGRESS' } } });
    ctx.client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 0, status: 'PASSED', completedAt: 1 } },
    });

    await takeSnapshots(ctx, {} as any);
    expect(ctx.client.runQuery).toHaveBeenCalledWith(
      expect.stringMatching(/SnapshotBuildQuery/),
      { number: 1 },
      { headers: { Authorization: `Bearer report-token` } }
    );
    expect(ctx.client.runQuery).toHaveBeenCalledTimes(2);
    expect(ctx.build).toEqual({ ...build, changeCount: 0, status: 'PASSED', completedAt: 1 });
    expect(ctx.exitCode).toBe(0);
  });

  it('sets exitCode to 1 when build has changes', async () => {
    const build = { app: { repository: { provider: 'github' } }, number: 1, features: {} };
    const ctx = {
      ...createBaseTestContext(),
      build,
      announcedBuild: build,
    } as any;

    ctx.client.runQuery.mockReturnValueOnce({ app: { build: { status: 'IN_PROGRESS' } } });
    ctx.client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 2, status: 'PENDING', completedAt: 1 } },
    });

    await takeSnapshots(ctx, {} as any);
    expect(ctx.build).toEqual({ ...build, changeCount: 2, status: 'PENDING', completedAt: 1 });
    expect(ctx.exitCode).toBe(1);
  });

  it('sets exitCode to 0 when build has changes but --exit-zero-on-changes is set with `true` string', async () => {
    const build = { app: { repository: { provider: 'github' } }, number: 1, features: {} };
    const ctx = {
      ...createBaseTestContext(),
      options: {
        exitZeroOnChanges: 'true',
      },
      build,
      announcedBuild: build,
    } as any;

    ctx.client.runQuery.mockReturnValueOnce({ app: { build: { status: 'IN_PROGRESS' } } });
    ctx.client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 2, status: 'PENDING', completedAt: 1 } },
    });

    await takeSnapshots(ctx, {} as any);
    expect(ctx.build).toEqual({ ...build, changeCount: 2, status: 'PENDING', completedAt: 1 });
    expect(ctx.exitCode).toBe(0);
  });

  it('sets exitCode to 2 when build is broken (capture error)', async () => {
    const build = { app: { repository: { provider: 'github' } }, number: 1, features: {} };
    const ctx = {
      ...createBaseTestContext(),
      build,
      announcedBuild: build,
    } as any;

    ctx.client.runQuery.mockReturnValueOnce({ app: { build: { status: 'IN_PROGRESS' } } });
    ctx.client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 2, status: 'BROKEN', completedAt: 1 } },
    });

    await takeSnapshots(ctx, {} as any);
    expect(ctx.build).toEqual({ ...build, changeCount: 2, status: 'BROKEN', completedAt: 1 });
    expect(ctx.exitCode).toBe(2);
  });

  it('sets exitCode to 3 when build fails (system error)', async () => {
    const build = { app: { repository: { provider: 'github' } }, number: 1, features: {} };
    const ctx = {
      ...createBaseTestContext(),
      build,
      announcedBuild: build,
    } as any;

    ctx.client.runQuery.mockReturnValueOnce({ app: { build: { status: 'IN_PROGRESS' } } });
    ctx.client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 2, status: 'FAILED', completedAt: 1 } },
    });

    await takeSnapshots(ctx, {} as any);
    expect(ctx.build).toEqual({ ...build, changeCount: 2, status: 'FAILED', completedAt: 1 });
    expect(ctx.exitCode).toBe(3);
  });

  it('calls experimental_onTaskProgress with progress', async () => {
    const build = {
      app: { repository: { provider: 'github' } },
      number: 1,
      features: {},
      reportToken: 'report-token',
      actualTestCount: 5,
      inProgressCount: 5,
    };
    const ctx = {
      ...createBaseTestContext(),
      options: { experimental_onTaskProgress: vi.fn() },
      build,
    } as any;

    ctx.client.runQuery.mockReturnValueOnce({
      app: { build: { status: 'IN_PROGRESS', inProgressCount: 5 } },
    });
    ctx.client.runQuery.mockReturnValueOnce({
      app: { build: { status: 'IN_PROGRESS', inProgressCount: 3 } },
    });
    ctx.client.runQuery.mockReturnValueOnce({
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
    const build = {
      app: { repository: { provider: 'github' } },
      number: 1,
      features: {},
      reportToken: 'report-token',
      id: 'build-123',
    };
    const ctx = {
      ...createBaseTestContext(),
      build,
    } as any;

    mockWaitForBuildToComplete.mockResolvedValue();
    ctx.client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 0, status: 'PASSED', completedAt: 1 } },
    });

    await takeSnapshots(ctx, {} as any);

    expect(mockWaitForBuildToComplete).toHaveBeenCalledWith({
      notifyServiceUrl: environment.CHROMATIC_NOTIFY_SERVICE_URL,
      buildId: 'build-123',
      progressMessageCallback: expect.any(Function),
      log: ctx.log,
      headers: {
        Authorization: 'Bearer report-token',
      },
    });
  });

  it('handles NotifyConnectionError gracefully and continues execution', async () => {
    const build = {
      app: { repository: { provider: 'github' } },
      number: 1,
      features: {},
      reportToken: 'report-token',
      id: 'build-123',
    };
    const ctx = {
      ...createBaseTestContext(),
      build,
    } as any;

    const connectionError = new NotifyConnectionError('Failed to connect to notify service', 1006);
    mockWaitForBuildToComplete.mockRejectedValue(connectionError);
    ctx.client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 0, status: 'PASSED', completedAt: 1 } },
    });

    await takeSnapshots(ctx, {} as any);

    expect(ctx.log.debug).toHaveBeenCalledWith(
      'Failed to connect to notify service, falling back to polling: code: 1006, original error: undefined'
    );
    expect(ctx.build).toEqual({ ...build, changeCount: 0, status: 'PASSED', completedAt: 1 });
    expect(ctx.exitCode).toBe(0);
  });

  it('handles NotifyServiceError gracefully and continues execution', async () => {
    const build = {
      app: { repository: { provider: 'github' } },
      number: 1,
      features: {},
      reportToken: 'report-token',
      id: 'build-123',
    };
    const ctx = {
      ...createBaseTestContext(),
      build,
    } as any;

    const notifyError = new NotifyServiceError(
      'Connection failed',
      1001,
      'Going away',
      new Error('Original error')
    );
    mockWaitForBuildToComplete.mockRejectedValue(notifyError);
    ctx.client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 0, status: 'PASSED', completedAt: 1 } },
    });

    await takeSnapshots(ctx, {} as any);

    expect(ctx.log.debug).toHaveBeenCalledWith(
      'Error getting updates from notify service: Connection failed code: 1001, reason: Going away, original error: Original error'
    );
    expect(ctx.build).toEqual({ ...build, changeCount: 0, status: 'PASSED', completedAt: 1 });
    expect(ctx.exitCode).toBe(0);
  });

  it('handles NotifyServiceMessageTimeoutError gracefully and continues execution', async () => {
    const build = {
      app: { repository: { provider: 'github' } },
      number: 1,
      features: {},
      reportToken: 'report-token',
      id: 'build-123',
    };
    const ctx = {
      ...createBaseTestContext(),
      build,
    } as any;

    const timeoutError = new NotifyServiceMessageTimeoutError(
      'Timed out waiting for message',
      408,
      '408 Request Timeout'
    );
    mockWaitForBuildToComplete.mockRejectedValue(timeoutError);
    ctx.client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 0, status: 'PASSED', completedAt: 1 } },
    });

    await takeSnapshots(ctx, {} as any);

    expect(ctx.log.debug).toHaveBeenCalledWith(
      'Timed out waiting for message from notify service, falling back to polling'
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(timeoutError);
    expect(ctx.build).toEqual({ ...build, changeCount: 0, status: 'PASSED', completedAt: 1 });
    expect(ctx.exitCode).toBe(0);
  });

  it('handles generic errors gracefully and continues execution', async () => {
    const build = {
      app: { repository: { provider: 'github' } },
      number: 1,
      features: {},
      reportToken: 'report-token',
      id: 'build-123',
    };
    const ctx = {
      ...createBaseTestContext(),
      build,
    } as any;

    const genericError = new Error('Generic connection error');
    mockWaitForBuildToComplete.mockRejectedValue(genericError);
    ctx.client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 0, status: 'PASSED', completedAt: 1 } },
    });

    await takeSnapshots(ctx, {} as any);

    expect(ctx.log.error).toHaveBeenCalledWith(
      'Unexpected error from notify service: Generic connection error'
    );
    expect(ctx.build).toEqual({ ...build, changeCount: 0, status: 'PASSED', completedAt: 1 });
    expect(ctx.exitCode).toBe(0);
  });

  it('handles authentication errors gracefully and continues execution', async () => {
    const build = {
      app: { repository: { provider: 'github' } },
      number: 1,
      features: {},
      reportToken: 'report-token',
      id: 'build-123',
    };
    const ctx = {
      ...createBaseTestContext(),
      build,
    } as any;

    const authenticationError = new NotifyServiceAuthenticationError('Unauthorized request', 401);
    mockWaitForBuildToComplete.mockRejectedValue(authenticationError);
    ctx.client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 0, status: 'PASSED', completedAt: 1 } },
    });

    await takeSnapshots(ctx, {} as any);

    expect(ctx.log.debug).toHaveBeenCalledWith(
      'Error authenticating with notify service: 401 Unauthorized request'
    );
    expect(ctx.build).toEqual({ ...build, changeCount: 0, status: 'PASSED', completedAt: 1 });
    expect(ctx.exitCode).toBe(0);
  });

  it('calls experimental_onTaskProgress via waitForBuildToComplete progress callback', async () => {
    const build = {
      app: { repository: { provider: 'github' } },
      number: 1,
      features: {},
      reportToken: 'report-token',
      actualTestCount: 5,
      id: 'build-123',
    };
    const ctx = {
      ...createBaseTestContext(),
      options: { experimental_onTaskProgress: vi.fn() },
      build,
    } as any;

    let progressCallback: any;
    mockWaitForBuildToComplete.mockImplementation(({ progressMessageCallback }) => {
      progressCallback = progressMessageCallback;
      return Promise.resolve();
    });
    ctx.client.runQuery.mockReturnValueOnce({
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
