import { getCliCommand as getCliCommandDefault } from '@antfu/ni';
import TestLogger from '@cli/testLogger';
import { execa as execaDefault } from 'execa';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { validateStorybookReactNativeVersion as validateStorybookReactNativeVersionDefault } from '../lib/react-native/validateStorybookVersion';
import { announceBuild, setEnvironment, setRuntimeMetadata } from './initialize';

vi.mock('@antfu/ni');
vi.mock('execa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('execa')>();
  return {
    ...actual,
    execa: vi.fn(() => Promise.resolve()),
  };
});
vi.mock('../lib/react-native/validateStorybookVersion', () => ({
  validateStorybookReactNativeVersion: vi.fn().mockResolvedValue(undefined),
}));

const execa = vi.mocked(execaDefault);
const getCliCommand = vi.mocked(getCliCommandDefault);
const validateStorybookReactNativeVersion = vi.mocked(validateStorybookReactNativeVersionDefault);

process.env.GERRIT_BRANCH = 'foo/bar';
process.env.TRAVIS_EVENT_TYPE = 'pull_request';

const environment = { ENVIRONMENT_WHITELIST: [/^GERRIT/, /^TRAVIS/] };
const log = new TestLogger();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('setEnvironment', () => {
  it('sets the environment info on context', async () => {
    const ctx = { env: environment, log } as any;
    await setEnvironment(ctx);
    expect(ctx.environment).toMatchObject({
      GERRIT_BRANCH: 'foo/bar',
      TRAVIS_EVENT_TYPE: 'pull_request',
    });
  });
});

describe('setRuntimeMetadata', () => {
  beforeEach(() => {
    execa.mockReturnValue(Promise.resolve({ stdout: '1.2.3' }) as any);
  });

  it('sets the build command on the context', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('npm'));

    const ctx = {
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '6.2.0' },
      git: { changedFiles: ['./index.js'] },
    } as any;
    await setRuntimeMetadata(ctx);

    expect(ctx.runtimeMetadata).toEqual({
      nodePlatform: expect.stringMatching(/darwin|linux|win32/),
      nodeVersion: process.versions.node,
      packageManager: 'npm',
      packageManagerVersion: '1.2.3',
    });
  });

  it('supports yarn', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('yarn'));

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
    getCliCommand.mockReturnValue(Promise.resolve('pnpm'));

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
    env: environment,
    log,
    options: {},
    environment: ':environment',
    git: { version: 'whatever', matchesBranch: () => false, committedAt: 0 },
    pkg: { version: '1.0.0' },
    storybook: {
      baseDir: '',
      version: '2.0.0',
      addons: [],
      refs: {
        design: { title: 'Design System', url: 'https://design.example.com' },
      },
    },
    runtimeMetadata: {
      nodePlatform: 'darwin',
      nodeVersion: '18.12.1',
      packageManager: 'npm',
      pacakgeManagerVersion: '8.19.2',
    },
  };

  it('creates a build on the index and puts it on context', async () => {
    const build = {
      number: 1,
      status: 'ANNOUNCED',
      id: 'announced-build-id',
      app: { id: 'announced-build-app-id' },
    };
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
          storybookRefs: ctx.storybook.refs,
          storybookVersion: ctx.storybook.version,
          projectMetadata: {
            storybookBaseDir: '',
          },
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

  it.each([
    { gqlValue: null, expected: false },
    { gqlValue: false, expected: false },
    { gqlValue: true, expected: true },
  ])(
    'sets ctx.isReactNativeApp to $expected when features.isReactNativeApp is $gqlValue',
    async ({ gqlValue, expected }) => {
      const features = { isReactNativeApp: gqlValue };
      const build = { number: 1, status: 'ANNOUNCED', app: {}, features };
      const client = { runQuery: vi.fn() };
      client.runQuery.mockReturnValue({ announceBuild: build });

      const ctx = { client, ...defaultContext } as any;
      await announceBuild(ctx);

      expect(ctx.isReactNativeApp).toBe(expected);
    }
  );

  it('throws an error when TurboSnap is enabled for a React Native app', async () => {
    const build = { number: 1, status: 'ANNOUNCED', app: {}, features: { isReactNativeApp: true } };
    const client = { runQuery: vi.fn() };
    client.runQuery.mockReturnValue({ announceBuild: build });

    const ctx = { client, turboSnap: {}, ...defaultContext } as any;
    await expect(announceBuild(ctx)).rejects.toThrow(
      /TurboSnap is not supported for Storybook React Native projects./
    );
  });

  describe('Storybook React Native version validation', () => {
    it('validates Storybook React Native version for React Native apps', async () => {
      const build = {
        number: 1,
        status: 'ANNOUNCED',
        app: {},
        features: { isReactNativeApp: true },
      };
      const client = { runQuery: vi.fn() };
      client.runQuery.mockReturnValue({ announceBuild: build });

      const ctx = { client, ...defaultContext } as any;
      await announceBuild(ctx);

      expect(validateStorybookReactNativeVersion).toHaveBeenCalledTimes(1);
    });

    it('does not validate for non-React-Native apps', async () => {
      const build = {
        number: 1,
        status: 'ANNOUNCED',
        app: {},
        features: { isReactNativeApp: false },
      };
      const client = { runQuery: vi.fn() };
      client.runQuery.mockReturnValue({ announceBuild: build });

      const ctx = { client, ...defaultContext } as any;
      await announceBuild(ctx);

      expect(validateStorybookReactNativeVersion).not.toHaveBeenCalled();
    });

    it('propagates validation errors', async () => {
      const validationError = new Error('Unsupported Storybook React Native version');
      validateStorybookReactNativeVersion.mockRejectedValue(validationError);

      const build = {
        number: 1,
        status: 'ANNOUNCED',
        app: {},
        features: { isReactNativeApp: true },
      };
      const client = { runQuery: vi.fn() };
      client.runQuery.mockReturnValue({ announceBuild: build });

      const ctx = { client, ...defaultContext } as any;
      await expect(announceBuild(ctx)).rejects.toThrow(validationError);
    });

    it('reports the version error before the TurboSnap error when both apply', async () => {
      const validationError = new Error('Unsupported Storybook React Native version');
      validateStorybookReactNativeVersion.mockRejectedValue(validationError);

      const build = {
        number: 1,
        status: 'ANNOUNCED',
        app: {},
        features: { isReactNativeApp: true },
      };
      const client = { runQuery: vi.fn() };
      client.runQuery.mockReturnValue({ announceBuild: build });

      const ctx = { client, turboSnap: {}, ...defaultContext } as any;
      await expect(announceBuild(ctx)).rejects.toThrow(validationError);
    });
  });
});
