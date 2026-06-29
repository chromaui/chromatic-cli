import { describe, expect, it, vi } from 'vitest';

import { exitCodes } from '../../lib/setExitCode';
import TestLogger from '../../lib/testLogger';
import { verifyBuild } from './verifyBuild';

const environment = {
  CHROMATIC_POLL_INTERVAL: 10,
  CHROMATIC_UPGRADE_TIMEOUT: 100,
  STORYBOOK_VERIFY_TIMEOUT: 20,
};
const log = new TestLogger();

const buildDeps = (client: { runQuery: ReturnType<typeof vi.fn> }) =>
  ({ client, env: environment, log, report: vi.fn() }) as any;

const defaultInput = {
  options: {},
  matchesBranch: () => false,
  announcedBuild: { number: 1, reportToken: 'report-token' },
} as any;

describe('verifyBuild', () => {
  it('waits for the build to start', async () => {
    const build = {
      status: 'IN_PROGRESS',
      features: { uiTests: true, uiReview: false },
      app: {},
      startedAt: Date.now(),
    };
    const publishedBuild = { ...build, status: 'PUBLISHED', startedAt: null, upgradeBuilds: [] };
    const client = { runQuery: vi.fn() };
    client.runQuery
      // We can safely poll three times without hitting the timeout
      .mockReturnValueOnce({ app: { build: publishedBuild } })
      .mockReturnValueOnce({ app: { build: publishedBuild } })
      .mockReturnValue({ app: { build } });

    const result = await verifyBuild(buildDeps(client), defaultInput);

    expect(client.runQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/StartedBuildQuery/),
      { number: 1 },
      { headers: { Authorization: `Bearer report-token` } }
    );
    expect(client.runQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/StartedBuildQuery/),
      { number: 1 },
      { headers: { Authorization: `Bearer report-token` } }
    );
    expect(client.runQuery).toHaveBeenNthCalledWith(
      3,
      expect.stringMatching(/StartedBuildQuery/),
      { number: 1 },
      { headers: { Authorization: `Bearer report-token` } }
    );
    expect(client.runQuery).toHaveBeenNthCalledWith(
      4,
      expect.stringMatching(/VerifyBuildQuery/),
      { number: 1 },
      { headers: { Authorization: `Bearer report-token` } }
    );
    expect(client.runQuery).toHaveBeenCalledTimes(4);
    expect(result.build).toMatchObject(build);
    expect(result.limitExitCode).toBe(undefined);
    expect(result.skipSnapshots).toBe(false);
  });

  it('times out if build takes too long to start', async () => {
    const publishedBuild = {
      status: 'PUBLISHED',
      features: { uiTests: true, uiReview: false },
      app: {},
      startedAt: null,
      upgradeBuilds: [],
    };
    const client = { runQuery: vi.fn() };
    client.runQuery.mockReturnValue({ app: { build: publishedBuild } });

    const error = await verifyBuild(buildDeps(client), defaultInput).catch((error_) => error_);
    expect(error.message).toBe('Build verification timed out');
    expect(error.exitCode).toBe(exitCodes.VERIFICATION_TIMEOUT);
  });

  it('waits for upgrade builds before starting verification timeout', async () => {
    const build = {
      status: 'IN_PROGRESS',
      features: { uiTests: true, uiReview: false },
      app: {},
      startedAt: Date.now(),
    };
    const upgradeBuilds = [{ completedAt: null }];
    const completed = [{ completedAt: Date.now() }];
    const publishedBuild = { ...build, status: 'PUBLISHED', startedAt: null, upgradeBuilds };
    const client = { runQuery: vi.fn() };
    client.runQuery
      // Polling while upgrade builds are in progress is irrelevant
      .mockReturnValueOnce({ app: { build: publishedBuild } })
      .mockReturnValueOnce({ app: { build: publishedBuild } })
      .mockReturnValueOnce({ app: { build: publishedBuild } })
      .mockReturnValueOnce({ app: { build: publishedBuild } })
      .mockReturnValueOnce({ app: { build: publishedBuild } })
      // We can safely poll three times without hitting the timeout
      .mockReturnValueOnce({ app: { build: { ...publishedBuild, upgradeBuilds: completed } } })
      .mockReturnValueOnce({ app: { build: { ...publishedBuild, upgradeBuilds: completed } } })
      .mockReturnValue({ app: { build } });

    const result = await verifyBuild(buildDeps(client), defaultInput);

    expect(result.build).toMatchObject(build);
    expect(result.limitExitCode).toBe(undefined);
  });

  it('times out if upgrade builds take too long to complete', async () => {
    const build = {
      status: 'IN_PROGRESS',
      features: { uiTests: true, uiReview: false },
      app: {},
      startedAt: Date.now(),
    };
    const upgradeBuilds = [{ completedAt: null }];
    const publishedBuild = { ...build, status: 'PUBLISHED', startedAt: null, upgradeBuilds };
    const client = { runQuery: vi.fn() };
    client.runQuery.mockReturnValue({ app: { build: publishedBuild } });

    await expect(verifyBuild(buildDeps(client), defaultInput)).rejects.toThrow(
      'Timed out waiting for upgrade builds to complete'
    );
  });

  it('reports a limit exit code of 5 if build was limited', async () => {
    const client = { runQuery: vi.fn() };
    client.runQuery.mockReturnValue({
      app: {
        build: {
          number: 1,
          status: 'IN_PROGRESS',
          storybookUrl: 'https://5d67dc0374b2e300209c41e7-pfkaemtlit.chromatic.com/',
          features: { uiTests: true, uiReview: false },
          app: { account: {} },
          wasLimited: true,
          startedAt: Date.now(),
        },
      },
    });

    const result = await verifyBuild(buildDeps(client), defaultInput);
    expect(result.limitExitCode?.code).toBe(exitCodes.BUILD_WAS_LIMITED);
  });

  it('reports a limit exit code of 11 if snapshot quota was reached', async () => {
    const client = { runQuery: vi.fn() };
    client.runQuery.mockReturnValue({
      app: {
        build: {
          number: 1,
          status: 'IN_PROGRESS',
          storybookUrl: 'https://5d67dc0374b2e300209c41e7-pfkaemtlit.chromatic.com/',
          features: { uiTests: true, uiReview: false },
          app: { account: { exceededThreshold: true } },
          wasLimited: true,
          startedAt: Date.now(),
        },
      },
    });

    const result = await verifyBuild(buildDeps(client), defaultInput);
    expect(result.limitExitCode?.code).toBe(exitCodes.ACCOUNT_QUOTA_REACHED);
  });

  it('reports a limit exit code of 12 if payment is required', async () => {
    const client = { runQuery: vi.fn() };
    client.runQuery.mockReturnValue({
      app: {
        build: {
          number: 1,
          status: 'IN_PROGRESS',
          storybookUrl: 'https://5d67dc0374b2e300209c41e7-pfkaemtlit.chromatic.com/',
          features: { uiTests: true, uiReview: false },
          app: { account: { paymentRequired: true } },
          wasLimited: true,
          startedAt: Date.now(),
        },
      },
    });

    const result = await verifyBuild(buildDeps(client), defaultInput);
    expect(result.limitExitCode?.code).toBe(exitCodes.ACCOUNT_PAYMENT_REQUIRED);
  });

  it('skips snapshotting for publish-only builds', async () => {
    const client = { runQuery: vi.fn() };
    client.runQuery.mockReturnValue({
      app: {
        build: {
          number: 1,
          status: 'IN_PROGRESS',
          storybookUrl: 'https://5d67dc0374b2e300209c41e7-pfkaemtlit.chromatic.com/',
          features: { uiTests: false, uiReview: false },
          app: { account: { paymentRequired: true } },
          wasLimited: true,
          startedAt: Date.now(),
        },
      },
    });

    const result = await verifyBuild(buildDeps(client), defaultInput);
    expect(result.isPublishOnly).toBe(true);
    expect(result.skipSnapshots).toBe(true);
  });
});
