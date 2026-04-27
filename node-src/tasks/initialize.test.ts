import TestLogger from '@cli/testLogger';
import { execa as execaDefault } from 'execa';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { validateStorybookReactNativeVersion as validateStorybookReactNativeVersionDefault } from '../lib/react-native/validateStorybookVersion';
import { announceBuild, setEnvironment, setRuntimeMetadata } from './initialize';

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
  const ports = {
    proc: { run: vi.fn(async () => ({ stdout: '1.2.3', stderr: '', exitCode: 0 })) },
    pkgMgr: { detect: vi.fn(async () => ({ name: 'npm', version: '1.2.3' })) },
  } as any;

  beforeEach(() => {
    execa.mockReturnValue(Promise.resolve({ stdout: '1.2.3' }) as any);
    ports.proc.run.mockResolvedValue({ stdout: '1.2.3', stderr: '', exitCode: 0 });
    ports.pkgMgr.detect.mockResolvedValue({ name: 'npm', version: '1.2.3' });
  });

  it('sets the build command on the context', async () => {
    ports.pkgMgr.detect.mockResolvedValue({ name: 'npm', version: '1.2.3' });

    const ctx = {
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '6.2.0' },
      git: { changedFiles: ['./index.js'] },
      ports,
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
    ports.pkgMgr.detect.mockResolvedValue({ name: 'yarn', version: '1.2.3' });

    const ctx = {
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '6.1.0' },
      git: {},
      ports,
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
    ports.pkgMgr.detect.mockResolvedValue({ name: 'pnpm', version: '1.2.3' });

    const ctx = {
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '6.1.0' },
      git: {},
      ports,
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
    const announceBuildFunction = vi.fn().mockResolvedValue(build);
    const ports = { chromatic: { announceBuild: announceBuildFunction } };

    const ctx = { ports, ...defaultContext } as any;
    await announceBuild(ctx);

    expect(announceBuildFunction).toHaveBeenCalledWith({
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
    });
    expect(ctx.announcedBuild).toEqual(build);
    expect(ctx.isOnboarding).toBe(true);
  });

  it('requires baselines for TurboSnap-enabled builds', async () => {
    const build = { number: 1, status: 'ANNOUNCED', app: {} };
    const announceBuildFunction = vi.fn().mockResolvedValue(build);
    const ports = { chromatic: { announceBuild: announceBuildFunction } };

    const ctx = { ports, ...defaultContext, turboSnap: {} } as any;
    await announceBuild(ctx);

    expect(announceBuildFunction).toHaveBeenCalledWith({
      input: expect.objectContaining({ needsBaselines: true }),
    });
  });

  it('does not require baselines for TurboSnap bailed builds', async () => {
    const build = { number: 1, status: 'ANNOUNCED', app: {} };
    const announceBuildFunction = vi.fn().mockResolvedValue(build);
    const ports = { chromatic: { announceBuild: announceBuildFunction } };

    const ctx = { ports, ...defaultContext, turboSnap: { bailReason: {} } } as any;
    await announceBuild(ctx);

    expect(announceBuildFunction).toHaveBeenCalledWith({
      input: expect.objectContaining({ needsBaselines: false }),
    });
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
      const announceBuildFunction = vi.fn().mockResolvedValue(build);
      const ports = { chromatic: { announceBuild: announceBuildFunction } };

      const ctx = { ports, ...defaultContext } as any;
      await announceBuild(ctx);

      expect(ctx.isReactNativeApp).toBe(expected);
    }
  );

  it('throws an error when TurboSnap is enabled for a React Native app', async () => {
    const build = { number: 1, status: 'ANNOUNCED', app: {}, features: { isReactNativeApp: true } };
    const announceBuildFunction = vi.fn().mockResolvedValue(build);
    const ports = { chromatic: { announceBuild: announceBuildFunction } };

    const ctx = { ports, turboSnap: {}, ...defaultContext } as any;
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
      const announceBuildFunction = vi.fn().mockResolvedValue(build);
      const ports = { chromatic: { announceBuild: announceBuildFunction } };

      const ctx = { ports, ...defaultContext } as any;
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
      const announceBuildFunction = vi.fn().mockResolvedValue(build);
      const ports = { chromatic: { announceBuild: announceBuildFunction } };

      const ctx = { ports, ...defaultContext } as any;
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
      const announceBuildFunction = vi.fn().mockResolvedValue(build);
      const ports = { chromatic: { announceBuild: announceBuildFunction } };

      const ctx = { ports, ...defaultContext } as any;
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
      const announceBuildFunction = vi.fn().mockResolvedValue(build);
      const ports = { chromatic: { announceBuild: announceBuildFunction } };

      const ctx = { ports, turboSnap: {}, ...defaultContext } as any;
      await expect(announceBuild(ctx)).rejects.toThrow(validationError);
    });
  });
});
