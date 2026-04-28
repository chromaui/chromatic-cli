import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as validateModule from '../../lib/react-native/validateStorybookVersion';
import TestLogger from '../../lib/testLogger';
import type { Options } from '../../types';
import { runInitializePhase } from './initialize';

vi.mock('../../lib/react-native/validateStorybookVersion', () => ({
  validateStorybookReactNativeVersion: vi.fn().mockResolvedValue(undefined),
}));

const validateStorybookReactNativeVersion = vi.mocked(
  validateModule.validateStorybookReactNativeVersion
);

const baseEnvironment = { ENVIRONMENT_WHITELIST: [/^GERRIT/, /^TRAVIS/] };
const basePackage = { version: '1.0.0' };
const baseStorybook = {
  version: '7.0.0',
  configDir: '.storybook',
  staticDir: [] as string[],
  addons: [] as { name: string }[],
  builder: { name: 'webpack' },
  refs: {},
  baseDir: '',
} as any;

function makeGit(overrides: Record<string, unknown> = {}): any {
  return {
    branch: 'main',
    commit: 'abc',
    committedAt: 0,
    fromCI: false,
    matchesBranch: () => false,
    ...overrides,
  };
}

function makePorts(overrides: { announceBuild?: any; pkgMgr?: any; host?: any } = {}) {
  return {
    chromatic: {
      announceBuild:
        overrides.announceBuild ??
        vi.fn(async () => ({
          id: 'build-id',
          number: 2,
          browsers: ['chrome'],
          status: 'ANNOUNCED',
          autoAcceptChanges: false,
          reportToken: 'token',
          features: { isReactNativeApp: false, uiTests: true, uiReview: true },
          app: { id: 'app-id', turboSnapAvailability: 'AVAILABLE' },
        })),
    },
    host: {
      all: () => ({}),
      platform: () => 'darwin' as NodeJS.Platform,
      nodeVersion: () => '20.0.0',
      cwd: () => '/cwd',
      ...overrides.host,
    },
    pkgMgr: {
      detect: vi.fn(async () => ({ name: 'npm', version: '10.0.0' })),
      ...overrides.pkgMgr,
    },
    errors: {
      setTag: vi.fn(),
      setContext: vi.fn(),
      captureException: vi.fn(),
      flush: vi.fn(),
    },
    fs: { exists: vi.fn(async () => false), readJson: vi.fn() },
  } as any;
}

beforeEach(() => {
  validateStorybookReactNativeVersion.mockReset();
  validateStorybookReactNativeVersion.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('runInitializePhase', () => {
  it('announces a build and returns the AnnouncedState slice', async () => {
    const log = new TestLogger();
    const ports = makePorts();
    const result = await runInitializePhase({
      options: {} as Options,
      env: baseEnvironment,
      git: makeGit({ parentCommits: ['parent'] }),
      storybook: baseStorybook,
      pkg: basePackage,
      isOnboarding: false,
      log,
      ports,
    });
    expect(result.announcedBuild.id).toBe('build-id');
    expect(result.isOnboarding).toBe(false);
    expect(result.isReactNativeApp).toBe(false);
    expect(result.runtimeMetadata).toEqual({
      nodePlatform: 'darwin',
      nodeVersion: '20.0.0',
      packageManager: 'npm',
      packageManagerVersion: '10.0.0',
    });
    expect(ports.errors.setTag).toHaveBeenCalledWith('app_id', 'app-id');
    expect(ports.errors.setContext).toHaveBeenCalledWith('build', { id: 'build-id' });
  });

  it('filters environment variables through the whitelist', async () => {
    const log = new TestLogger();
    const ports = makePorts({
      host: {
        all: () => ({ GERRIT_BRANCH: 'foo', TRAVIS_OS_NAME: 'linux', SECRET: 'leak' }),
      },
    });
    const result = await runInitializePhase({
      options: {} as Options,
      env: baseEnvironment,
      git: makeGit({ parentCommits: ['parent'] }),
      storybook: baseStorybook,
      pkg: basePackage,
      isOnboarding: false,
      log,
      ports,
    });
    expect(result.environment).toEqual({ GERRIT_BRANCH: 'foo', TRAVIS_OS_NAME: 'linux' });
  });

  it('flags onboarding when announced number is 1', async () => {
    const log = new TestLogger();
    const ports = makePorts({
      announceBuild: vi.fn(async () => ({
        id: 'b',
        number: 1,
        browsers: ['chrome'],
        status: 'ANNOUNCED',
        autoAcceptChanges: false,
        reportToken: 't',
        features: { isReactNativeApp: false, uiTests: true, uiReview: true },
        app: { id: 'a', turboSnapAvailability: 'AVAILABLE' },
      })),
    });
    const result = await runInitializePhase({
      options: {} as Options,
      env: baseEnvironment,
      git: makeGit({ parentCommits: ['parent'] }),
      storybook: baseStorybook,
      pkg: basePackage,
      isOnboarding: false,
      log,
      ports,
    });
    expect(result.isOnboarding).toBe(true);
  });

  it('marks turboSnap unavailable when the API reports it', async () => {
    const log = new TestLogger();
    const ports = makePorts({
      announceBuild: vi.fn(async () => ({
        id: 'b',
        number: 5,
        browsers: ['chrome'],
        status: 'ANNOUNCED',
        autoAcceptChanges: false,
        reportToken: 't',
        features: { isReactNativeApp: false, uiTests: true, uiReview: true },
        app: { id: 'a', turboSnapAvailability: 'UNAVAILABLE' },
      })),
    });
    const result = await runInitializePhase({
      options: {} as Options,
      env: baseEnvironment,
      git: makeGit({ parentCommits: ['parent'] }),
      storybook: baseStorybook,
      pkg: basePackage,
      turboSnap: { rootPath: '/repo' },
      isOnboarding: false,
      log,
      ports,
    });
    expect(result.turboSnap?.unavailable).toBe(true);
  });

  it('throws when TurboSnap is requested for a React Native build', async () => {
    const ports = makePorts({
      announceBuild: vi.fn(async () => ({
        id: 'b',
        number: 5,
        browsers: ['ios'],
        status: 'ANNOUNCED',
        autoAcceptChanges: false,
        reportToken: 't',
        features: { isReactNativeApp: true, uiTests: true, uiReview: true },
        app: { id: 'a', turboSnapAvailability: 'AVAILABLE' },
      })),
    });
    await expect(
      runInitializePhase({
        options: {} as Options,
        env: baseEnvironment,
        git: makeGit({ parentCommits: ['parent'] }),
        storybook: baseStorybook,
        pkg: basePackage,
        turboSnap: {},
        isOnboarding: false,
        log: new TestLogger(),
        ports,
      })
    ).rejects.toThrow(/TurboSnap is not supported for Storybook React Native/);
  });

  it('warns when there is no ancestor build outside onboarding', async () => {
    const log = new TestLogger();
    const ports = makePorts();
    await runInitializePhase({
      options: {} as Options,
      env: baseEnvironment,
      git: makeGit(),
      storybook: baseStorybook,
      pkg: basePackage,
      isOnboarding: false,
      log,
      ports,
    });
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('without ancestor builds'));
  });

  it('reads needsBaselines from turboSnap presence and bailReason', async () => {
    const announceBuild = vi.fn(async () => ({
      id: 'b',
      number: 2,
      browsers: ['chrome'],
      status: 'ANNOUNCED',
      autoAcceptChanges: false,
      reportToken: 't',
      features: { isReactNativeApp: false, uiTests: true, uiReview: true },
      app: { id: 'a', turboSnapAvailability: 'AVAILABLE' },
    }));
    const ports = makePorts({ announceBuild });
    await runInitializePhase({
      options: {} as Options,
      env: baseEnvironment,
      git: makeGit({ parentCommits: ['parent'] }),
      storybook: baseStorybook,
      pkg: basePackage,
      turboSnap: { bailReason: { rebuild: true } },
      isOnboarding: false,
      log: new TestLogger(),
      ports,
    });
    expect(announceBuild).toHaveBeenCalledWith({
      input: expect.objectContaining({ needsBaselines: false }),
    });
  });

  it('omits sensitive git fields from the announce input', async () => {
    const announceBuild = vi.fn(async (args: { input: any }) => {
      void args;
      return {
        id: 'b',
        number: 2,
        browsers: ['chrome'],
        status: 'ANNOUNCED',
        autoAcceptChanges: false,
        reportToken: 't',
        features: { isReactNativeApp: false, uiTests: true, uiReview: true },
        app: { id: 'a', turboSnapAvailability: 'AVAILABLE' },
      };
    });
    const ports = makePorts({ announceBuild });
    await runInitializePhase({
      options: {} as Options,
      env: baseEnvironment,
      git: makeGit({
        parentCommits: ['parent'],
        version: 'git-2.0',
        gitUserEmail: 'tester@example.com',
        rootPath: '/cwd',
        changedFiles: ['a.ts'],
        baselineCommits: ['c'],
        replacementBuildIds: [['x', 'y']],
      }),
      storybook: baseStorybook,
      pkg: basePackage,
      isOnboarding: false,
      log: new TestLogger(),
      ports,
    });
    const sentInput = announceBuild.mock.calls.at(-1)?.[0].input as Record<string, unknown>;
    expect(sentInput).not.toHaveProperty('version');
    expect(sentInput).not.toHaveProperty('changedFiles');
    expect(sentInput).not.toHaveProperty('baselineCommits');
    expect(sentInput).not.toHaveProperty('replacementBuildIds');
    expect(sentInput).not.toHaveProperty('rootPath');
    expect(sentInput).not.toHaveProperty('gitUserEmail');
    expect(sentInput.gitUserEmailHash).toEqual(expect.any(String));
  });
});
