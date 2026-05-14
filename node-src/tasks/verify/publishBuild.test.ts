import { describe, expect, it, vi } from 'vitest';

import TestLogger from '../../lib/testLogger';
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
});
