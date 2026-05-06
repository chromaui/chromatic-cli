import { validateStorybookReactNativeVersion as validateStorybookReactNativeVersionDefault } from '@cli/react-native/validateStorybookVersion';
import TestLogger from '@cli/testLogger';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { announceBuild } from './index';

vi.mock('../../lib/react-native/validateStorybookVersion', () => ({
  validateStorybookReactNativeVersion: vi.fn().mockResolvedValue(undefined),
}));

const validateStorybookReactNativeVersion = vi.mocked(validateStorybookReactNativeVersionDefault);

const log = new TestLogger();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('announceBuild', () => {
  const defaultContext = {
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
