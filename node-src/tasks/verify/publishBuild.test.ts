import { describe, expect, it, vi } from 'vitest';

import TestLogger from '../../lib/testLogger';
import { publishBuild } from './publishBuild';

const log = new TestLogger();

const buildDeps = (client: { runQuery: ReturnType<typeof vi.fn> }) => ({ log, client }) as any;

describe('publishBuild', () => {
  it('publishes the build and returns the merged announced build', async () => {
    const announcedBuild = { number: 1, status: 'ANNOUNCED', reportToken: 'report-token' };
    const publishedBuild = { status: 'PUBLISHED' };
    const client = { runQuery: vi.fn() };
    client.runQuery.mockReturnValue({ publishBuild: publishedBuild });

    const result = await publishBuild(buildDeps(client), { announcedBuild, options: {} } as any);

    expect(client.runQuery).toHaveBeenCalledWith(
      expect.stringMatching(/PublishBuildMutation/),
      { input: { turboSnapStatus: 'UNUSED' } },
      { headers: { Authorization: `Bearer report-token` }, retries: 3 }
    );
    expect(result.announcedBuild).toEqual({ ...announcedBuild, ...publishedBuild });
  });

  it('forwards turboSnapBailReason with merged detail fields in the publishBuild input', async () => {
    const announcedBuild = { number: 1, status: 'ANNOUNCED', reportToken: 'report-token' };
    const publishedBuild = { status: 'PUBLISHED' };
    const client = { runQuery: vi.fn() };
    client.runQuery.mockReturnValue({ publishBuild: publishedBuild });

    const bailReason = {
      changedPackageFiles: ['./package.json'],
      bailSubreason: 'lockfileSizeExceeded',
      lockfileKind: 'yarn.lock',
      lockfileSizeBytes: 12_000_000,
      sentryEventId: 'sentry-event-id',
    };

    await publishBuild(buildDeps(client), {
      announcedBuild,
      options: {},
      turboSnap: { bailReason },
    } as any);

    expect(client.runQuery).toHaveBeenCalledWith(
      expect.stringMatching(/PublishBuildMutation/),
      {
        input: {
          turboSnapBailReason: bailReason,
          turboSnapStatus: 'BAILED',
        },
      },
      { headers: { Authorization: `Bearer report-token` }, retries: 3 }
    );
  });
});
