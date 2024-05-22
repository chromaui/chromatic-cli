import { execa as execaDefault, execaCommand } from 'execa';
import mockfs from 'mock-fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { announceBuild, setEnvironment, setRuntimeMetadata } from './initialize';

vi.mock('execa');

const execa = vi.mocked(execaDefault);
const command = vi.mocked(execaCommand);

afterEach(() => {
  mockfs.restore();
});

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

describe('setRuntimeMetadata', () => {
  beforeEach(() => {
    execa.mockReturnValue(Promise.resolve({ stdout: '1.2.3' }) as any);
    command.mockReturnValue(Promise.resolve({ stdout: '1.2.3' }) as any);
  });

  it('sets the build command on the context', async () => {
    mockfs({ './package.json': JSON.stringify({ packageManager: 'npm' }) });

    const ctx = {
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '6.2.0' },
      git: { changedFiles: ['./index.js'] },
    } as any;
    await setRuntimeMetadata(ctx);

    console.log(ctx.runtimeMetadata);

    expect(ctx.runtimeMetadata).toEqual({
      nodePlatform: expect.stringMatching(/darwin|linux|win32/),
      nodeVersion: process.versions.node,
      packageManager: 'npm',
      packageManagerVersion: '1.2.3',
    });
  });

  it('supports yarn', async () => {
    mockfs({
      './package.json': JSON.stringify({ packageManager: 'yarn' }),
      './yarn.lock': '',
    });

    const ctx = {
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '6.1.0' },
      git: {},
    } as any;
    await setRuntimeMetadata(ctx);

    expect(ctx.runtimeMetadata).toEqual({
      nodePlatform: expect.stringMatching(/darwin|linux|win32/),
      nodeVersion: process.versions.node,
      packageManager: 'yarn',
      packageManagerVersion: '1.2.3',
    });
  });

  it('supports pnpm', async () => {
    mockfs({
      './package.json': JSON.stringify({ packageManager: 'pnpm' }),
      './pnpm-lock.yaml': '',
    });

    const ctx = {
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '6.1.0' },
      git: {},
    } as any;
    await setRuntimeMetadata(ctx);

    expect(ctx.runtimeMetadata).toEqual({
      nodePlatform: expect.stringMatching(/darwin|linux|win32/),
      nodeVersion: process.versions.node,
      packageManager: 'pnpm',
      packageManagerVersion: '1.2.3',
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
    runtimeMetadata: {
      nodePlatform: 'darwin',
      nodeVersion: '18.12.1',
      packageManager: 'npm',
      pacakgeManagerVersion: '8.19.2',
    },
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
          ...defaultContext.runtimeMetadata,
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
