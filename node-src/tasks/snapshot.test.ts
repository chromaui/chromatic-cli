import waitForBuildToComplete, {
  NotifyConnectionError,
  NotifyServiceAuthenticationError,
  NotifyServiceError,
  NotifyServiceMessageTimeoutError,
} from '@cli/waitForBuildToComplete';
import * as Sentry from '@sentry/node';
import { describe, expect, it, vi } from 'vitest';

import TestLogger from '../lib/testLogger';
import {
  applySnapshotOutput,
  extractSnapshotInput,
  SnapshotOutput,
  snapshotProject,
} from './snapshot';

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
const log = new TestLogger();
const matchesBranch = () => false;

const createBaseTestContext = () => ({
  client: { runQuery: vi.fn(), setAuthorization: vi.fn() },
  env: environment,
  git: { matchesBranch },
  log,
  options: {},
});

const mockWaitForBuildToComplete = vi.mocked(waitForBuildToComplete);

// Project ctx into the (deps, input) seam the way `runTask` would, run the task body, then fold its
// result back onto ctx so the legacy assertions (ctx.build, ctx.exitCode) keep holding.
const runSnapshot = async (ctx: any) => {
  const report = vi.fn();
  const deps = { report, client: ctx.client, log: ctx.log, env: ctx.env, options: ctx.options };
  const input = extractSnapshotInput(ctx);
  const result = await snapshotProject(deps as any, input as any);
  if (result.kind === 'continue') {
    applySnapshotOutput(ctx, result.output);
  }
  return { result, report };
};

describe('snapshotProject', () => {
  it('waits for the build to complete and sets it on context', async () => {
    const build = {
      app: { repository: { provider: 'github' } },
      number: 1,
      features: {},
      reportToken: 'report-token',
    };
    const ctx = { ...createBaseTestContext(), build } as any;

    ctx.client.runQuery.mockReturnValueOnce({ app: { build: { status: 'IN_PROGRESS' } } });
    ctx.client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 0, status: 'PASSED', completedAt: 1 } },
    });

    await runSnapshot(ctx);
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
    const ctx = { ...createBaseTestContext(), build, announcedBuild: build } as any;

    ctx.client.runQuery.mockReturnValueOnce({ app: { build: { status: 'IN_PROGRESS' } } });
    ctx.client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 2, status: 'PENDING', completedAt: 1 } },
    });

    await runSnapshot(ctx);
    expect(ctx.build).toEqual({ ...build, changeCount: 2, status: 'PENDING', completedAt: 1 });
    expect(ctx.exitCode).toBe(1);
  });

  it('sets exitCode to 0 when build has changes but --exit-zero-on-changes is set with `true` string', async () => {
    const build = { app: { repository: { provider: 'github' } }, number: 1, features: {} };
    const ctx = {
      ...createBaseTestContext(),
      options: { exitZeroOnChanges: 'true' },
      build,
      announcedBuild: build,
    } as any;

    ctx.client.runQuery.mockReturnValueOnce({ app: { build: { status: 'IN_PROGRESS' } } });
    ctx.client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 2, status: 'PENDING', completedAt: 1 } },
    });

    await runSnapshot(ctx);
    expect(ctx.build).toEqual({ ...build, changeCount: 2, status: 'PENDING', completedAt: 1 });
    expect(ctx.exitCode).toBe(0);
  });

  it('sets exitCode to 2 when build is broken (capture error)', async () => {
    const build = { app: { repository: { provider: 'github' } }, number: 1, features: {} };
    const ctx = { ...createBaseTestContext(), build, announcedBuild: build } as any;

    ctx.client.runQuery.mockReturnValueOnce({ app: { build: { status: 'IN_PROGRESS' } } });
    ctx.client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 2, status: 'BROKEN', completedAt: 1 } },
    });

    await runSnapshot(ctx);
    expect(ctx.build).toEqual({ ...build, changeCount: 2, status: 'BROKEN', completedAt: 1 });
    expect(ctx.exitCode).toBe(2);
  });

  it('sets exitCode to 3 when build fails (system error)', async () => {
    const build = { app: { repository: { provider: 'github' } }, number: 1, features: {} };
    const ctx = { ...createBaseTestContext(), build, announcedBuild: build } as any;

    ctx.client.runQuery.mockReturnValueOnce({ app: { build: { status: 'IN_PROGRESS' } } });
    ctx.client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 2, status: 'FAILED', completedAt: 1 } },
    });

    await runSnapshot(ctx);
    expect(ctx.build).toEqual({ ...build, changeCount: 2, status: 'FAILED', completedAt: 1 });
    expect(ctx.exitCode).toBe(3);
  });

  it('sets exitCode to 6 when build is canceled', async () => {
    const build = { app: { repository: { provider: 'github' } }, number: 1, features: {} };
    const ctx = { ...createBaseTestContext(), build, announcedBuild: build } as any;

    ctx.client.runQuery.mockReturnValueOnce({
      app: { build: { status: 'CANCELLED', completedAt: 1 } },
    });

    await runSnapshot(ctx);
    expect(ctx.exitCode).toBe(6);
  });

  it('reports snapshot-count progress through deps.report', async () => {
    const build = {
      app: { repository: { provider: 'github' } },
      number: 1,
      features: {},
      reportToken: 'report-token',
      actualTestCount: 5,
      inProgressCount: 5,
    };
    const ctx = { ...createBaseTestContext(), build } as any;

    ctx.client.runQuery.mockReturnValueOnce({
      app: { build: { status: 'IN_PROGRESS', inProgressCount: 5 } },
    });
    ctx.client.runQuery.mockReturnValueOnce({
      app: { build: { status: 'IN_PROGRESS', inProgressCount: 3 } },
    });
    ctx.client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 0, status: 'PASSED', completedAt: 1, inProgressCount: 0 } },
    });

    const { report } = await runSnapshot(ctx);

    expect(report).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ progress: { progress: 1, total: 5, unit: 'snapshots' } })
    );
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ progress: { progress: 3, total: 5, unit: 'snapshots' } })
    );
    // Each report carries the live polled build so the engine can keep ctx.build fresh mid-task.
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ build: expect.objectContaining({ status: 'IN_PROGRESS' }) })
    );
  });

  it('does not call waitForBuildToComplete if there are no tests', async () => {
    const build = {
      app: { repository: { provider: 'github' } },
      number: 1,
      features: {},
      reportToken: 'report-token',
      id: 'build-123',
      actualTestCount: 0,
    };
    const ctx = { ...createBaseTestContext(), build } as any;

    mockWaitForBuildToComplete.mockResolvedValue();
    ctx.client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 0, status: 'PASSED', completedAt: 1 } },
    });

    await runSnapshot(ctx);

    expect(mockWaitForBuildToComplete).not.toHaveBeenCalled();
  });

  it('calls waitForBuildToComplete with correct arguments', async () => {
    const build = {
      app: { repository: { provider: 'github' } },
      number: 1,
      features: {},
      reportToken: 'report-token',
      id: 'build-123',
      actualTestCount: 1,
    };
    const ctx = { ...createBaseTestContext(), build } as any;

    mockWaitForBuildToComplete.mockResolvedValue();
    ctx.client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 0, status: 'PASSED', completedAt: 1 } },
    });

    await runSnapshot(ctx);

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
      actualTestCount: 1,
    };
    const ctx = { ...createBaseTestContext(), build } as any;

    const connectionError = new NotifyConnectionError('Failed to connect to notify service', 1006);
    mockWaitForBuildToComplete.mockRejectedValue(connectionError);
    ctx.client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 0, status: 'PASSED', completedAt: 1 } },
    });

    await runSnapshot(ctx);

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
      actualTestCount: 1,
    };
    const ctx = { ...createBaseTestContext(), build } as any;

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

    await runSnapshot(ctx);

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
      actualTestCount: 1,
    };
    const ctx = { ...createBaseTestContext(), build } as any;

    const timeoutError = new NotifyServiceMessageTimeoutError(
      'Timed out waiting for message',
      408,
      '408 Request Timeout'
    );
    mockWaitForBuildToComplete.mockRejectedValue(timeoutError);
    ctx.client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 0, status: 'PASSED', completedAt: 1 } },
    });

    await runSnapshot(ctx);

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
      actualTestCount: 1,
    };
    const ctx = { ...createBaseTestContext(), build } as any;

    const genericError = new Error('Generic connection error');
    mockWaitForBuildToComplete.mockRejectedValue(genericError);
    ctx.client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 0, status: 'PASSED', completedAt: 1 } },
    });

    await runSnapshot(ctx);

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
      actualTestCount: 1,
    };
    const ctx = { ...createBaseTestContext(), build } as any;

    const authenticationError = new NotifyServiceAuthenticationError('Unauthorized request', 401);
    mockWaitForBuildToComplete.mockRejectedValue(authenticationError);
    ctx.client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 0, status: 'PASSED', completedAt: 1 } },
    });

    await runSnapshot(ctx);

    expect(ctx.log.debug).toHaveBeenCalledWith(
      'Error authenticating with notify service: 401 Unauthorized request'
    );
    expect(ctx.build).toEqual({ ...build, changeCount: 0, status: 'PASSED', completedAt: 1 });
    expect(ctx.exitCode).toBe(0);
  });

  it('reports progress via the waitForBuildToComplete progress callback', async () => {
    const build = {
      app: { repository: { provider: 'github' } },
      number: 1,
      features: {},
      reportToken: 'report-token',
      actualTestCount: 5,
      id: 'build-123',
    };
    const ctx = { ...createBaseTestContext(), build } as any;

    let progressCallback: any;
    mockWaitForBuildToComplete.mockImplementation(({ progressMessageCallback }) => {
      progressCallback = progressMessageCallback;
      return Promise.resolve();
    });
    ctx.client.runQuery.mockReturnValueOnce({
      app: { build: { changeCount: 0, status: 'PASSED', completedAt: 1 } },
    });

    const { report } = await runSnapshot(ctx);

    // Simulate progress messages through the callback
    progressCallback({ inProgressCount: 3, status: 'IN_PROGRESS' });
    progressCallback({ inProgressCount: 1, status: 'IN_PROGRESS' });

    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ progress: { progress: 3, total: 5, unit: 'snapshots' } })
    );
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ progress: { progress: 5, total: 5, unit: 'snapshots' } })
    );
  });

  it('self-skips for --dry-run without polling', async () => {
    const build = { app: {}, number: 1, features: {} };
    const ctx = { ...createBaseTestContext(), options: { dryRun: true }, build } as any;

    const { result } = await runSnapshot(ctx);

    expect(result.kind).toBe('skip-self');
    expect(ctx.client.runQuery).not.toHaveBeenCalled();
    expect(ctx.exitCode).toBeUndefined();
  });

  it('self-skips when ctx.skipSnapshots is set without polling', async () => {
    const build = { app: {}, number: 1, features: {} };
    const ctx = { ...createBaseTestContext(), skipSnapshots: true, build } as any;

    const { result } = await runSnapshot(ctx);

    expect(result.kind).toBe('skip-self');
    expect(ctx.client.runQuery).not.toHaveBeenCalled();
  });
});

describe('applySnapshotOutput', () => {
  it('sets the exit code, writes the build onto ctx, and logs the passed message', () => {
    const build = { number: 1, changeCount: 0, webUrl: 'https://x' } as any;
    const ctx = { log, options: {} } as any;
    const output: SnapshotOutput = { exitCode: 0, userError: false, log: 'passed', build };

    applySnapshotOutput(ctx, output);

    expect(ctx.build).toBe(build);
    expect(ctx.exitCode).toBe(0);
    expect(ctx.log.info).toHaveBeenCalled();
  });

  it('sets the changes exit code as a user error and logs the changes message', () => {
    const build = { number: 1, changeCount: 2, webUrl: 'https://x' } as any;
    const ctx = { log, options: {} } as any;
    const output: SnapshotOutput = { exitCode: 1, userError: true, log: 'changes', build };

    applySnapshotOutput(ctx, output);

    expect(ctx.exitCode).toBe(1);
    expect(ctx.userError).toBe(true);
    expect(ctx.log.error).toHaveBeenCalled();
  });
});
