import { createAnalyticsClient as createAnalyticsClientDefault } from '@cli/analytics';
import { validateStorybookReactNativeVersion as validateStorybookReactNativeVersionDefault } from '@cli/react-native/validateStorybookVersion';
import TestLogger from '@cli/testLogger';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnnouncedBuild, RuntimeMetadata } from '../../types';
import { announceBuild as announceBuildDefault } from './announceBuild';
import { gatherEnvironment as gatherEnvironmentDefault } from './gatherEnvironment';
import { getRuntimeMetadata as getRuntimeMetadataDefault } from './getRuntimeMetadata';
import { applyInitializeOutput, extractInitializeInput, initialize } from './index';

vi.mock('../../lib/react-native/validateStorybookVersion', () => ({
  validateStorybookReactNativeVersion: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@cli/analytics', () => ({
  createAnalyticsClient: vi.fn(),
}));
vi.mock('./gatherEnvironment');
vi.mock('./getRuntimeMetadata');
vi.mock('./announceBuild');

const validateStorybookReactNativeVersion = vi.mocked(validateStorybookReactNativeVersionDefault);
const createAnalyticsClient = vi.mocked(createAnalyticsClientDefault);
const gatherEnvironment = vi.mocked(gatherEnvironmentDefault);
const getRuntimeMetadata = vi.mocked(getRuntimeMetadataDefault);
const announceBuild = vi.mocked(announceBuildDefault);

const log = new TestLogger();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('initialize', () => {
  const environment = { CI: 'true' };
  const runtimeMetadata: RuntimeMetadata = {
    nodePlatform: 'darwin',
    nodeVersion: '18.0.0',
    packageManager: 'npm',
    packageManagerVersion: '8.0.0',
  };
  const announcedBuild: AnnouncedBuild = {
    id: 'announced-build-id',
    number: 1,
    browsers: ['chrome'],
    status: 'ANNOUNCED',
    autoAcceptChanges: false,
    reportToken: 'report-token',
    app: { id: 'app-id', turboSnapAvailability: 'AVAILABLE', isOnboarding: false },
  };
  const partialAnnounceBuildInput = {
    git: { commit: 'abc123', parentCommits: ['def456'] },
    turboSnap: { unavailable: false },
    rebuildForBuildId: 'build-id',
    storybook: { version: '7.0.0' },
    projectMetadata: { name: 'my-project' },
    isOnboarding: false,
  } as any;
  const deps = { log } as any;
  const input = { partialAnnounceBuildInput };

  beforeEach(() => {
    gatherEnvironment.mockReturnValue(environment);
    getRuntimeMetadata.mockResolvedValue(runtimeMetadata);
    announceBuild.mockResolvedValue(announcedBuild);
  });

  it('returns continue with composed output from each subtask', async () => {
    const result = await initialize(deps, input);
    expect(result).toEqual({
      kind: 'continue',
      output: { environment, runtimeMetadata, announcedBuild },
    });
  });

  it('forwards deps and subtask outputs through entire pipeline', async () => {
    await initialize(deps, input);

    expect(gatherEnvironment).toHaveBeenCalledExactlyOnceWith(deps);
    expect(getRuntimeMetadata).toHaveBeenCalledExactlyOnceWith(deps);
    expect(announceBuild).toHaveBeenCalledExactlyOnceWith(deps, {
      ...partialAnnounceBuildInput,
      environment,
      runtimeMetadata,
    });
  });
});

describe('extractInitializeInput', () => {
  it('extracts announceBuild input fields from context', () => {
    const ctx = {
      git: { commit: 'abc123', parentCommits: ['def456'] },
      turboSnap: { unavailable: false },
      rebuildForBuildId: 'build-id',
      storybook: { version: '7.0.0' },
      projectMetadata: { name: 'my-project' },
      isOnboarding: false,
      // unrelated fields that should not be extracted
      client: {},
      options: {},
    } as any;

    const result = extractInitializeInput(ctx);

    expect(result).toEqual({
      partialAnnounceBuildInput: {
        git: ctx.git,
        turboSnap: ctx.turboSnap,
        rebuildForBuildId: ctx.rebuildForBuildId,
        storybook: ctx.storybook,
        projectMetadata: ctx.projectMetadata,
      },
    });
  });

  it('passes through undefined optional fields', () => {
    const ctx = {
      git: { commit: 'abc123' },
      storybook: { version: '7.0.0' },
      projectMetadata: { name: 'my-project' },
      isOnboarding: true,
    } as any;

    const result = extractInitializeInput(ctx);

    expect(result.partialAnnounceBuildInput).toMatchObject({
      git: ctx.git,
      turboSnap: undefined,
      rebuildForBuildId: undefined,
      storybook: ctx.storybook,
      projectMetadata: ctx.projectMetadata,
    });
  });
});

const makeFeatures = (overrides?: Partial<AnnouncedBuild['features']>) => ({
  uiTests: false,
  uiReview: false,
  isReactNativeApp: false,
  ...overrides,
});
const buildContext = (overrides: Record<string, any> = {}): any => ({
  log,
  git: { parentCommits: ['def456'] },
  ...overrides,
});
describe('applyInitializeOutput', () => {
  const announcedBuild = {
    id: 'announced-build-id',
    number: 1,
    browsers: ['chrome'],
    status: 'ANNOUNCED',
    autoAcceptChanges: false,
    reportToken: 'report-token',
    app: { id: 'announced-build-app-id', turboSnapAvailability: 'AVAILABLE', isOnboarding: false },
  };
  const output = {
    environment: { foo: 'bar' },
    runtimeMetadata: {
      nodePlatform: 'darwin',
      nodeVersion: '16.13.0',
      packageManager: 'npm',
      packageManagerVersion: '8.1.2',
    } as RuntimeMetadata,
    announcedBuild: announcedBuild,
  };
  it('sets runtimeMetadata and announcedBuild on ctx from output', async () => {
    const ctx = buildContext();

    await applyInitializeOutput(ctx, output);

    expect(ctx.environment).toBe(output.environment); // environment is deprecated and will be removed in a major
    expect(ctx.runtimeMetadata).toBe(output.runtimeMetadata);
    expect(ctx.announcedBuild).toBe(output.announcedBuild);
  });

  describe('ctx.isOnboarding', () => {
    it.each([
      { initial: true, appIsOnboarding: false, expected: true },
      { initial: false, appIsOnboarding: true, expected: true },
      { initial: false, appIsOnboarding: false, expected: false },
      { initial: true, appIsOnboarding: true, expected: true },
    ])(
      'is $expected when ctx.isOnboarding=$initial and app.isOnboarding=$appIsOnboarding',
      async ({ initial, appIsOnboarding, expected }) => {
        const ctx = buildContext({ isOnboarding: initial });

        await applyInitializeOutput(ctx, {
          ...output,
          announcedBuild: {
            ...announcedBuild,
            app: { ...announcedBuild.app, isOnboarding: appIsOnboarding },
          },
        });

        expect(ctx.isOnboarding).toBe(expected);
      }
    );
  });

  describe('ctx.turboSnap.unavailable', () => {
    it('does nothing when ctx.turboSnap is undefined', async () => {
      const ctx = buildContext();

      await applyInitializeOutput(ctx, output);

      expect(ctx.turboSnap).toBeUndefined();
    });

    it('leaves unavailable falsy when turboSnapAvailability is AVAILABLE', async () => {
      const ctx = buildContext({ turboSnap: {} });

      await applyInitializeOutput(ctx, {
        ...output,
        announcedBuild: {
          ...announcedBuild,
          app: { ...announcedBuild.app, turboSnapAvailability: 'AVAILABLE' },
        },
      });

      expect(ctx.turboSnap.unavailable).toBeFalsy();
    });

    it('sets unavailable=true when turboSnapAvailability is UNAVAILABLE', async () => {
      const ctx = buildContext({ turboSnap: {} });

      await applyInitializeOutput(ctx, {
        ...output,
        announcedBuild: {
          ...announcedBuild,
          app: { ...announcedBuild.app, turboSnapAvailability: 'UNAVAILABLE' },
        },
      });

      expect(ctx.turboSnap.unavailable).toBe(true);
    });
  });

  describe('noAncestorBuild warning', () => {
    it('does not warn when ctx.isOnboarding becomes true', async () => {
      const ctx = buildContext({ git: { parentCommits: undefined } });

      await applyInitializeOutput(ctx, {
        ...output,
        announcedBuild: {
          ...announcedBuild,
          app: { ...announcedBuild.app, isOnboarding: true },
        },
      });

      expect(log.warn).not.toHaveBeenCalled();
    });

    it('does not warn when parentCommits exist', async () => {
      const ctx = buildContext();

      await applyInitializeOutput(ctx, {
        ...output,
        announcedBuild: {
          ...announcedBuild,
          app: { ...announcedBuild.app, isOnboarding: false },
        },
      });

      expect(log.warn).not.toHaveBeenCalled();
    });

    it('warns when not onboarding and parentCommits is missing', async () => {
      const ctx = buildContext({ git: { parentCommits: undefined } });

      await applyInitializeOutput(ctx, {
        ...output,
        announcedBuild: {
          ...announcedBuild,
          app: { ...announcedBuild.app, isOnboarding: false },
        },
      });

      expect(log.warn).toHaveBeenCalledTimes(1);
    });

    it('warns when not onboarding and parentCommits is empty array', async () => {
      const ctx = buildContext({ git: { parentCommits: [] } });

      await applyInitializeOutput(ctx, {
        ...output,
        announcedBuild: {
          ...announcedBuild,
          app: { ...announcedBuild.app, isOnboarding: false },
        },
      });

      expect(log.warn).toHaveBeenCalledTimes(1);
    });
  });

  describe('analytics', () => {
    it('sets ctx.analytics from createAnalyticsClient', async () => {
      const analytics = { trackEvent: vi.fn() };
      createAnalyticsClient.mockReturnValue(analytics as any);
      const ctx = buildContext();

      await applyInitializeOutput(ctx, output);

      expect(createAnalyticsClient).toHaveBeenCalledExactlyOnceWith(ctx);
      expect(ctx.analytics).toBe(analytics);
    });
  });
  it.each([
    { outputValue: undefined, expected: false },
    { outputValue: makeFeatures({ isReactNativeApp: false }), expected: false },
    { outputValue: makeFeatures({ isReactNativeApp: true }), expected: true },
  ])(
    'sets ctx.isReactNativeApp to $expected when features is $outputValue',
    async ({ outputValue, expected }) => {
      const ctx = buildContext();

      await applyInitializeOutput(ctx, {
        ...output,
        announcedBuild: { ...announcedBuild, features: outputValue },
      });

      expect(ctx.isReactNativeApp).toBe(expected);
    }
  );
  it('throws an error when TurboSnap is enabled for a React Native app', async () => {
    const ctx = buildContext({ turboSnap: {} });

    await expect(
      applyInitializeOutput(ctx, {
        ...output,
        announcedBuild: { ...announcedBuild, features: makeFeatures({ isReactNativeApp: true }) },
      })
    ).rejects.toThrow(/TurboSnap is not supported for Storybook React Native projects./);
  });

  describe('Storybook React Native version validation', () => {
    it('validates Storybook React Native version for React Native apps', async () => {
      const ctx = buildContext();

      await applyInitializeOutput(ctx, {
        ...output,
        announcedBuild: { ...announcedBuild, features: makeFeatures({ isReactNativeApp: true }) },
      });

      expect(validateStorybookReactNativeVersion).toHaveBeenCalledTimes(1);
    });

    it('does not validate for non-React-Native apps', async () => {
      const ctx = buildContext();

      await applyInitializeOutput(ctx, {
        ...output,
        announcedBuild: { ...announcedBuild, features: makeFeatures({ isReactNativeApp: false }) },
      });

      expect(validateStorybookReactNativeVersion).not.toHaveBeenCalled();
    });

    it('propagates validation errors', async () => {
      const validationError = new Error('Unsupported Storybook React Native version');
      validateStorybookReactNativeVersion.mockRejectedValue(validationError);

      const ctx = buildContext();

      await expect(
        applyInitializeOutput(ctx, {
          ...output,
          announcedBuild: { ...announcedBuild, features: makeFeatures({ isReactNativeApp: true }) },
        })
      ).rejects.toThrow(validationError);
    });

    it('reports the version error before the TurboSnap error when both apply', async () => {
      const validationError = new Error('Unsupported Storybook React Native version');
      validateStorybookReactNativeVersion.mockRejectedValue(validationError);

      const ctx = buildContext({ turboSnap: {} });

      await expect(
        applyInitializeOutput(ctx, {
          ...output,
          announcedBuild: { ...announcedBuild, features: makeFeatures({ isReactNativeApp: true }) },
        })
      ).rejects.toThrow(validationError);
    });
  });
});
