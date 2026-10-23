import TestLogger from '@cli/testLogger';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usageStatus } from '../../lib/usageStatus.fake';
import { Deps } from '../../types';
import { announceBuild, AnnounceBuildInput } from './announceBuild';

const log = new TestLogger();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('announceBuild', () => {
  const client = { runQuery: vi.fn() };
  const deps = {
    log,
    client: client as unknown as Deps['client'],
    options: {} as Deps['options'],
    env: {} as Deps['env'],
    pkg: { version: '1.0.0' } as Deps['pkg'],
  };
  const input: AnnounceBuildInput = {
    git: {
      version: 'whatever',
      rootPath: '/repo',
      matchesBranch: () => false,
      committedAt: 0,
      branch: 'branch',
      commit: 'abc',
      fromCI: false,
    },
    environment: { foo: 'bar' },
    runtimeMetadata: {
      nodePlatform: 'darwin',
      nodeVersion: '18.12.1',
      packageManager: 'npm',
      packageManagerVersion: '8.19.2',
    },
    storybook: {
      projectRoot: '/repo',
      version: '2.0.0',
      addons: [],
      refs: {
        design: { title: 'Design System', url: 'https://design.example.com' },
      },
      configDir: '/repo/foo',
      staticDirs: [],
      builder: {
        name: 'webpack',
      },
    },
    projectMetadata: {},
  };

  it('creates a build on the index and returns it', async () => {
    const build = {
      number: 1,
      status: 'ANNOUNCED',
      id: 'announced-build-id',
      app: { id: 'announced-build-app-id' },
    };
    client.runQuery.mockReturnValue({ announceBuild: build });

    const result = await announceBuild(deps, input);

    expect(client.runQuery).toHaveBeenCalledWith(
      expect.stringMatching(/AnnounceBuildMutation/),
      {
        input: {
          autoAcceptChanges: false,
          branch: input.git.branch,
          patchBaseRef: undefined,
          patchHeadRef: undefined,
          ciVariables: input.environment,
          commit: input.git.commit,
          committedAt: new Date(input.git.committedAt),
          fromCI: input.git.fromCI,
          isLocalBuild: undefined,
          needsBaselines: false,
          preserveMissingSpecs: undefined,
          packageVersion: deps.pkg.version,
          rebuildForBuildId: undefined,
          storybookAddons: input.storybook.addons,
          storybookRefs: input.storybook.refs,
          storybookVersion: input.storybook.version,
          projectMetadata: {
            storybookBaseDir: '.',
          },
          ...input.runtimeMetadata,
        },
      },
      { retries: 3 }
    );
    expect(result).toEqual(build);
  });

  it('requires baselines for TurboSnap-enabled builds', async () => {
    const build = {
      number: 1,
      status: 'ANNOUNCED',
      id: 'announced-build-id',
      app: { id: 'announced-build-app-id' },
    };
    client.runQuery.mockReturnValue({ announceBuild: build });

    const result = await announceBuild(deps, { ...input, turboSnap: {} });

    expect(client.runQuery).toHaveBeenCalledWith(
      expect.stringMatching(/AnnounceBuildMutation/),
      { input: expect.objectContaining({ needsBaselines: true }) },
      { retries: 3 }
    );
    expect(result).toEqual(build);
  });

  it('does not require baselines for TurboSnap bailed builds', async () => {
    const build = {
      number: 1,
      status: 'ANNOUNCED',
      id: 'announced-build-id',
      app: { id: 'announced-build-app-id' },
    };
    client.runQuery.mockReturnValue({ announceBuild: build });

    const result = await announceBuild(deps, { ...input, turboSnap: { bailReason: {} } });

    expect(client.runQuery).toHaveBeenCalledWith(
      expect.stringMatching(/AnnounceBuildMutation/),
      { input: expect.objectContaining({ needsBaselines: false }) },
      { retries: 3 }
    );
    expect(result).toEqual(build);
  });
  it.each(['UNUSED', 'APPLIED'])(
    'keeps optimization unconfirmed when TurboSnap is eligible (%s) and onlyChanged is unset',
    async (turboSnapAvailability) => {
      const build = {
        id: 'usage-build',
        app: { id: 'app', turboSnapAvailability },
        features: { uiTests: true },
        usageStatus,
      };
      client.runQuery.mockResolvedValue({ announceBuild: build });
      const result = await announceBuild(deps, input);
      expect(result.usageStatus).toEqual(usageStatus);
      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('70%'));
      expect(log.warn).not.toHaveBeenCalledWith(expect.stringMatching(/^TurboSnap/));
      expect(log.info).toHaveBeenCalledWith(
        expect.stringContaining('Hash-based TurboSnap may apply automatically')
      );
    }
  );

  it.each([
    { options: { onlyChanged: false }, env: {} },
    { options: {}, env: { CHROMATIC_TURBOSNAP_DISABLE_HASHES: true } },
  ])('warns when both TurboSnap paths are disabled (%j)', async ({ options, env }) => {
    client.runQuery.mockResolvedValue({
      announceBuild: {
        id: 'build',
        app: { id: 'app', turboSnapAvailability: 'APPLIED' },
        features: { uiTests: true },
      },
    });

    await announceBuild(
      { ...deps, options: { ...deps.options, ...options }, env: { ...deps.env, ...env } },
      input
    );

    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('is disabled for this run'));
    expect(log.info).not.toHaveBeenCalled();
  });

  it('does not report TurboSnap disabled when v1 is enabled and hashes are disabled', async () => {
    client.runQuery.mockResolvedValue({
      announceBuild: {
        id: 'build',
        app: { id: 'app', turboSnapAvailability: 'APPLIED' },
        features: { uiTests: true },
      },
    });

    await announceBuild(
      {
        ...deps,
        options: { ...deps.options, onlyChanged: true },
        env: { ...deps.env, CHROMATIC_TURBOSNAP_DISABLE_HASHES: true },
      },
      { ...input, turboSnap: {} }
    );

    expect(log.warn).not.toHaveBeenCalled();
    expect(log.info).not.toHaveBeenCalled();
  });

  it.each([
    { uiTests: false, uiReview: false },
    { uiTests: true, isReactNativeApp: true },
  ])('does not suggest TurboSnap for unsupported project features (%j)', async (features) => {
    client.runQuery.mockResolvedValue({
      announceBuild: {
        id: 'build',
        app: { id: 'app', turboSnapAvailability: 'APPLIED' },
        features,
      },
    });

    await announceBuild(deps, input);

    expect(log.warn).not.toHaveBeenCalled();
    expect(log.info).not.toHaveBeenCalled();
  });

  it('does not suggest enabling TurboSnap when it is unavailable or already enabled', async () => {
    client.runQuery.mockResolvedValue({
      announceBuild: {
        id: 'build',
        app: { id: 'app', turboSnapAvailability: 'UNAVAILABLE' },
        features: { uiTests: true },
      },
    });
    await announceBuild(deps, input);
    expect(log.warn).not.toHaveBeenCalled();
    expect(log.info).not.toHaveBeenCalled();
    client.runQuery.mockResolvedValue({
      announceBuild: {
        id: 'build',
        app: { id: 'app', turboSnapAvailability: 'APPLIED' },
        features: { uiTests: true },
      },
    });
    await announceBuild(deps, { ...input, turboSnap: {} });
    expect(log.warn).not.toHaveBeenCalled();
    expect(log.info).not.toHaveBeenCalled();
  });
});
