import { describe, expect, it, vi } from 'vitest';

import { announceBuild, setEnvironment } from './initialize';

process.env.GERRIT_BRANCH = 'foo/bar';
process.env.TRAVIS_EVENT_TYPE = 'pull_request';

const env = { ENVIRONMENT_WHITELIST: [/^GERRIT/, /^TRAVIS/] };
const log = { info: vi.fn(), warn: vi.fn(), debug: vi.fn() };

describe('setEnvironment', () => {
  it('sets the environment info on context', async () => {
    const ctx = { env, log } as any;
    await setEnvironment(ctx);
    expect(ctx.environment).toContain({
      GERRIT_BRANCH: 'foo/bar',
      TRAVIS_EVENT_TYPE: 'pull_request',
    });
  });
});

describe('announceBuild', () => {
  const defaultContext = {
    env,
    log,
    options: {},
    environment: ':environment',
    git: { version: 'whatever', matchesBranch: () => false, committedAt: 0 },
    pkg: { version: '1.0.0' },
    storybook: { version: '2.0.0', viewLayer: 'react', addons: [] },
  };

  it('creates a build on the index and puts it on context', async () => {
    const build = { number: 1, status: 'ANNOUNCED' };
    const client = { runQuery: vi.fn() };
    client.runQuery.mockReturnValue({ announceBuild: build });

    const ctx = { client, ...defaultContext } as any;
    await announceBuild(ctx);

    expect(client.runQuery).toHaveBeenCalledWith(
      expect.stringMatching(/AnnounceBuildMutation/),
      {
        input: {
          autoAcceptChanges: false,
          patchBaseRef: undefined,
          patchHeadRef: undefined,
          ciVariables: ctx.environment,
          committedAt: new Date(0),
          needsBaselines: false,
          preserveMissingSpecs: undefined,
          packageVersion: ctx.pkg.version,
          rebuildForBuildId: undefined,
          storybookAddons: ctx.storybook.addons,
          storybookVersion: ctx.storybook.version,
          storybookViewLayer: ctx.storybook.viewLayer,
        },
      },
      { retries: 3 }
    );
    expect(ctx.announcedBuild).toEqual(build);
    expect(ctx.isOnboarding).toBe(true);
  });

  it('requires baselines for TurboSnap-enabled builds', async () => {
    const build = { number: 1, status: 'ANNOUNCED', app: {} };
    const client = { runQuery: vi.fn() };
    client.runQuery.mockReturnValue({ announceBuild: build });

    const ctx = { client, ...defaultContext, turboSnap: {} } as any;
    await announceBuild(ctx);

    expect(client.runQuery).toHaveBeenCalledWith(
      expect.stringMatching(/AnnounceBuildMutation/),
      { input: expect.objectContaining({ needsBaselines: true }) },
      { retries: 3 }
    );
  });

  it('does not require baselines for TurboSnap bailed builds', async () => {
    const build = { number: 1, status: 'ANNOUNCED', app: {} };
    const client = { runQuery: vi.fn() };
    client.runQuery.mockReturnValue({ announceBuild: build });

    const ctx = { client, ...defaultContext, turboSnap: { bailReason: {} } } as any;
    await announceBuild(ctx);

    expect(client.runQuery).toHaveBeenCalledWith(
      expect.stringMatching(/AnnounceBuildMutation/),
      { input: expect.objectContaining({ needsBaselines: false }) },
      { retries: 3 }
    );
  });
});
