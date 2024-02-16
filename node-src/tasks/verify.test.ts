import { describe, expect, it, vi } from 'vitest';

import { exitCodes } from '../lib/setExitCode';
import { publishBuild, verifyBuild } from './verify';

const env = {
  CHROMATIC_POLL_INTERVAL: 10,
  CHROMATIC_UPGRADE_TIMEOUT: 100,
  STORYBOOK_VERIFY_TIMEOUT: 20,
};
const log = { info: vi.fn(), warn: vi.fn(), debug: vi.fn() };
const http = { fetch: vi.fn() };

describe('publishBuild', () => {
  it('updates the build on the index and updates context', async () => {
    const announcedBuild = { number: 1, status: 'ANNOUNCED', reportToken: 'report-token' };
    const publishedBuild = { status: 'PUBLISHED' };
    const client = { runQuery: vi.fn() };
    client.runQuery.mockReturnValue({ publishBuild: publishedBuild });

    const ctx = {
      env,
      log,
      http,
      client,
      announcedBuild,
      git: {},
      sourceDir: '/static/',
      buildLogFile: 'build-storybook.log',
      options: {},
      packageJson: {},
    } as any;
    await publishBuild(ctx);

    expect(client.runQuery).toHaveBeenCalledWith(
      expect.stringMatching(/PublishBuildMutation/),
      { input: { turboSnapStatus: 'UNUSED' } },
      { headers: { Authorization: `Bearer report-token` }, retries: 3 }
    );
    expect(ctx.announcedBuild).toEqual({ ...announcedBuild, ...publishedBuild });
  });
});

describe('verifyBuild', () => {
  const defaultContext = {
    env,
    log,
    options: {},
    environment: ':environment',
    git: { version: 'whatever', matchesBranch: () => false },
    pkg: { version: '1.0.0' },
    storybook: { version: '2.0.0', viewLayer: 'react', addons: [] },
    announcedBuild: { number: 1, reportToken: 'report-token' },
  };

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

    const ctx = { client, ...defaultContext } as any;
    await verifyBuild(ctx, {} as any);

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
    expect(ctx.build).toMatchObject(build);
    expect(ctx.exitCode).toBe(undefined);
    expect(ctx.skipSnapshots).toBe(undefined);
  });

  it('times out if build takes too long to start', async () => {
    const build = {
      status: 'IN_PROGRESS',
      features: { uiTests: true, uiReview: false },
      app: {},
      startedAt: Date.now(),
    };
    const publishedBuild = { ...build, status: 'PUBLISHED', startedAt: null, upgradeBuilds: [] };
    const client = { runQuery: vi.fn() };
    client.runQuery
      // Polling four times is going to hit the timeout
      .mockReturnValueOnce({ app: { build: publishedBuild } })
      .mockReturnValueOnce({ app: { build: publishedBuild } })
      .mockReturnValueOnce({ app: { build: publishedBuild } })
      .mockReturnValue({ app: { build } });

    const ctx = { client, ...defaultContext } as any;
    await expect(verifyBuild(ctx, {} as any)).rejects.toThrow('Build verification timed out');

    expect(ctx.exitCode).toBe(exitCodes.VERIFICATION_TIMEOUT);
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

    const ctx = { client, ...defaultContext } as any;
    await verifyBuild(ctx, {} as any);

    expect(ctx.build).toMatchObject(build);
    expect(ctx.exitCode).toBe(undefined);
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

    const ctx = { client, ...defaultContext } as any;
    await expect(verifyBuild(ctx, {} as any)).rejects.toThrow(
      'Timed out waiting for upgrade builds to complete'
    );
  });

  it('sets exitCode to 5 if build was limited', async () => {
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

    const ctx = { client, ...defaultContext } as any;
    await verifyBuild(ctx, {} as any);
    expect(ctx.exitCode).toBe(5);
  });

  it('sets exitCode to 11 if snapshot quota was reached', async () => {
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

    const ctx = { client, ...defaultContext } as any;
    await verifyBuild(ctx, {} as any);
    expect(ctx.exitCode).toBe(11);
  });

  it('sets exitCode to 12 if payment is required', async () => {
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

    const ctx = { client, ...defaultContext } as any;
    await verifyBuild(ctx, {} as any);
    expect(ctx.exitCode).toBe(12);
  });

  it('sets exitCode to 0 and skips snapshotting for publish-only builds', async () => {
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

    const ctx = { client, ...defaultContext } as any;
    await verifyBuild(ctx, {} as any);
    expect(ctx.exitCode).toBe(0);
    expect(ctx.skipSnapshots).toBe(true);
  });
});
