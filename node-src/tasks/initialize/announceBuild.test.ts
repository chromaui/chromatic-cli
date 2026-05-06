import TestLogger from '@cli/testLogger';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    pkg: { version: '1.0.0' } as Deps['pkg'],
  };
  const input: AnnounceBuildInput = {
    git: {
      version: 'whatever',
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
      baseDir: '',
      version: '2.0.0',
      addons: [],
      refs: {
        design: { title: 'Design System', url: 'https://design.example.com' },
      },
      configDir: './foo',
      staticDir: [],
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
            storybookBaseDir: '',
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
});
