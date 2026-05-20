import { describe, expect, it, vi } from 'vitest';

import TestLogger from '../../lib/testLogger';
import type { TurboSnapBailDetail } from '../../types';
import { publishBuild } from './publishBuild';

const environment = {
  CHROMATIC_POLL_INTERVAL: 10,
  CHROMATIC_UPGRADE_TIMEOUT: 100,
  STORYBOOK_VERIFY_TIMEOUT: 20,
};
const log = new TestLogger();
const http = { fetch: vi.fn() };

describe('publishBuild', () => {
  it('updates the build on the index and updates context', async () => {
    const announcedBuild = { number: 1, status: 'ANNOUNCED', reportToken: 'report-token' };
    const publishedBuild = { status: 'PUBLISHED' };
    const client = { runQuery: vi.fn() };
    client.runQuery.mockReturnValue({ publishBuild: publishedBuild });

    const ctx = {
      env: environment,
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

  it('sends turboSnapBailDetail in the publishBuild input when ctx.turboSnap.bailDetail is defined', async () => {
    const announcedBuild = { number: 1, status: 'ANNOUNCED', reportToken: 'report-token' };
    const publishedBuild = { status: 'PUBLISHED' };
    const client = { runQuery: vi.fn() };
    client.runQuery.mockReturnValue({ publishBuild: publishedBuild });

    const bailDetail: TurboSnapBailDetail = {
      reason: 'lockfileSizeExceeded',
      lockfileKind: 'yarn.lock',
      lockfileSizeBytes: 12_000_000,
      sentryEventId: 'sentry-event-id',
    };

    const ctx = {
      env: environment,
      log,
      http,
      client,
      announcedBuild,
      git: {},
      sourceDir: '/static/',
      buildLogFile: 'build-storybook.log',
      options: {},
      packageJson: {},
      turboSnap: {
        bailReason: { changedPackageFiles: ['./package.json'] },
        bailDetail,
      },
    } as any;
    await publishBuild(ctx);

    expect(client.runQuery).toHaveBeenCalledWith(
      expect.stringMatching(/PublishBuildMutation/),
      {
        input: {
          turboSnapBailReason: { changedPackageFiles: ['./package.json'] },
          turboSnapBailDetail: bailDetail,
          turboSnapStatus: 'BAILED',
        },
      },
      { headers: { Authorization: `Bearer report-token` }, retries: 3 }
    );
  });

  it('omits turboSnapBailDetail when ctx.turboSnap.bailDetail is undefined', async () => {
    const announcedBuild = { number: 1, status: 'ANNOUNCED', reportToken: 'report-token' };
    const publishedBuild = { status: 'PUBLISHED' };
    const client = { runQuery: vi.fn() };
    client.runQuery.mockReturnValue({ publishBuild: publishedBuild });

    const ctx = {
      env: environment,
      log,
      http,
      client,
      announcedBuild,
      git: {},
      sourceDir: '/static/',
      buildLogFile: 'build-storybook.log',
      options: {},
      packageJson: {},
      turboSnap: { bailReason: { changedPackageFiles: ['./package.json'] } },
    } as any;
    await publishBuild(ctx);

    const input = client.runQuery.mock.calls[0][1].input;
    expect(input).not.toHaveProperty('turboSnapBailDetail');
  });
});
