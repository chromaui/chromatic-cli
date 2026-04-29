/* eslint-disable max-lines */
import { getCliCommand as getCliCommandDefault } from '@antfu/ni';
import { AnalyticsEvent } from '@cli/analytics/events';
import * as Sentry from '@sentry/node';
import { execa as execaDefault, parseCommandString } from 'execa';
import { Readable } from 'stream';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import {
  buildAndroid as buildAndroidDefault,
  buildIos as buildIosDefault,
} from '../lib/react-native/build';
import { readExpoConfig as readExpoConfigDefault } from '../lib/react-native/expoConfig';
import { generateManifest } from '../lib/react-native/generateManifest';
import TestLogger from '../lib/testLogger';
import { patchModulePath } from '../lib/testUtilities';
import buildTask, {
  buildReactNativeArtifacts,
  buildStorybook,
  generateManifestForReactNative,
  setBuildCommand,
  setSourceDirectory,
} from './build';

vi.mock('@antfu/ni');
vi.mock('execa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('execa')>();
  return {
    ...actual,
    execa: vi.fn(() => Promise.resolve()),
  };
});
const mockLogStream = {
  write: vi.fn(),
  end: vi.fn((callback?: () => void) => {
    callback?.();
  }),
  on: vi.fn((event: string, callback: () => void) => {
    if (event === 'open') callback();
  }),
};

const mockLogLines = Array.from({ length: 25 }, (_, index) => `line ${index + 1}`).join('\n');

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    renameSync: vi.fn(),
    mkdirSync: vi.fn(),
    createWriteStream: vi.fn(() => mockLogStream),
    createReadStream: vi.fn(() => Readable.from([mockLogLines])),
    readFileSync: vi.fn(() => 'mock log content'),
  };
});
vi.mock('../lib/react-native/build', () => ({
  buildAndroid: vi.fn(() => Promise.resolve({ artifactPath: '/tmp/app-release.apk', duration: 1 })),
  buildIos: vi.fn(() => Promise.resolve({ artifactPath: '/tmp/MyApp.app', duration: 1 })),
}));
vi.mock('../lib/react-native/expoConfig', () => ({
  readExpoConfig: vi.fn(() => Promise.resolve({ platforms: ['ios', 'android'], name: 'MyApp' })),
}));
vi.mock('../lib/react-native/generateManifest', () => ({
  generateManifest: vi.fn(() => Promise.resolve()),
}));
vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
}));

const execa = vi.mocked(execaDefault);
const getCliCommand = vi.mocked(getCliCommandDefault);
const buildAndroid = vi.mocked(buildAndroidDefault);
const buildIos = vi.mocked(buildIosDefault);
const readExpoConfig = vi.mocked(readExpoConfigDefault);

const baseContext = { options: {}, flags: {} } as any;

beforeEach(() => {
  execa.mockClear();
  buildAndroid.mockClear();
  buildIos.mockClear();
  readExpoConfig.mockClear();
});

describe('setSourceDir', () => {
  it('sets a random temp directory path on the context', async () => {
    const ctx = { ...baseContext, storybook: { version: '5.0.0' } } as any;
    await setSourceDirectory(ctx);
    expect(ctx.sourceDir).toMatch(/chromatic-/);
  });

  it('falls back to the default output dir for older Storybooks', async () => {
    const ctx = { ...baseContext, storybook: { version: '4.0.0' } } as any;
    await setSourceDirectory(ctx);
    expect(ctx.sourceDir).toBe('storybook-static');
  });

  it('uses the outputDir option if provided', async () => {
    const ctx = {
      ...baseContext,
      options: { outputDir: 'storybook-out' },
      storybook: { version: '5.0.0' },
    } as any;
    await setSourceDirectory(ctx);
    expect(ctx.sourceDir).toBe('storybook-out');
  });

  it('uses the outputDir option if provided, even for older Storybooks', async () => {
    const ctx = {
      ...baseContext,
      options: { outputDir: 'storybook-out' },
      storybook: { version: '4.0.0' },
    } as any;
    await setSourceDirectory(ctx);
    expect(ctx.sourceDir).toBe('storybook-out');
  });
});

describe('setBuildCommand', () => {
  it('sets the build command on the context', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('npm run build:storybook'));

    const ctx = {
      ...baseContext,
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '6.2.0' },
      git: { changedFiles: ['./index.js'] },
    } as any;
    await setBuildCommand(ctx);

    expect(getCliCommand).toHaveBeenCalledWith(
      expect.anything(),
      ['build:storybook', '--output-dir=./source-dir/', '--webpack-stats-json=./source-dir/'],
      { programmatic: true }
    );
    expect(ctx.buildCommand).toEqual('npm run build:storybook');
  });

  it('supports yarn', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('yarn run build:storybook'));

    const ctx = {
      ...baseContext,
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '6.2.0' },
      git: { changedFiles: ['./index.js'] },
    } as any;
    await setBuildCommand(ctx);

    expect(getCliCommand).toHaveBeenCalledWith(
      expect.anything(),
      ['build:storybook', '--output-dir=./source-dir/', '--webpack-stats-json=./source-dir/'],
      { programmatic: true }
    );
    expect(ctx.buildCommand).toEqual('yarn run build:storybook');
  });

  it('supports pnpm', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('pnpm run build:storybook'));

    const ctx = {
      ...baseContext,
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '6.2.0' },
      git: { changedFiles: ['./index.js'] },
    } as any;
    await setBuildCommand(ctx);

    expect(getCliCommand).toHaveBeenCalledWith(
      expect.anything(),
      ['build:storybook', '--output-dir=./source-dir/', '--webpack-stats-json=./source-dir/'],
      { programmatic: true }
    );
    expect(ctx.buildCommand).toEqual('pnpm run build:storybook');
  });

  it('uses --build-command, if set', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('npm run build:storybook'));

    const ctx = {
      ...baseContext,
      sourceDir: './source-dir/',
      options: { buildCommand: 'nx run my-app:build-storybook' },
      storybook: { version: '6.2.0' },
      git: { changedFiles: ['./index.js'] },
    } as any;
    await setBuildCommand(ctx);

    expect(getCliCommand).not.toHaveBeenCalled();
    expect(ctx.buildCommand).toEqual(
      'nx run my-app:build-storybook --webpack-stats-json=./source-dir/'
    );
  });

  it('warns if --only-changes is not supported', async () => {
    const ctx = {
      ...baseContext,
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '6.1.0' },
      git: { changedFiles: ['./index.js'] },
      log: new TestLogger(),
    } as any;
    await setBuildCommand(ctx);
    expect(ctx.log.warn).toHaveBeenCalledWith(
      'Storybook version 6.2.0 or later is required to use the --only-changed flag'
    );
  });

  it('uses the correct flag for webpack stats for < 8.5.0', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('npm run build:storybook'));

    const ctx = {
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '8.4.0' },
      git: { changedFiles: ['./index.js'] },
    } as any;
    await setBuildCommand(ctx);

    expect(getCliCommand).toHaveBeenCalledWith(
      expect.anything(),
      ['build:storybook', '--output-dir=./source-dir/', '--webpack-stats-json=./source-dir/'],
      { programmatic: true }
    );
    expect(ctx.buildCommand).toEqual('npm run build:storybook');
  });

  it('uses the correct flag for webpack stats for >= 8.5.0', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('npm run build:storybook'));

    const ctx = {
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '8.5.0' },
      git: { changedFiles: ['./index.js'] },
    } as any;
    await setBuildCommand(ctx);

    expect(getCliCommand).toHaveBeenCalledWith(
      expect.anything(),
      ['build:storybook', '--output-dir=./source-dir/', '--stats-json=./source-dir/'],
      { programmatic: true }
    );
    expect(ctx.buildCommand).toEqual('npm run build:storybook');
  });

  it('uses the old flag when it storybook version is undetected', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('npm run build:storybook'));

    const ctx = {
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      git: { changedFiles: ['./index.js'] },
    } as any;
    await setBuildCommand(ctx);

    expect(getCliCommand).toHaveBeenCalledWith(
      expect.anything(),
      ['build:storybook', '--output-dir=./source-dir/', '--webpack-stats-json=./source-dir/'],
      { programmatic: true }
    );
    expect(ctx.buildCommand).toEqual('npm run build:storybook');
  });

  it.each(['playwright', 'cypress', 'vitest'])(
    'resolves to the E2E build command when using %s',
    async (e2ePackage) => {
      const revertPatch = patchModulePath(
        `@chromatic-com/${e2ePackage}/bin/build-archive-storybook`,
        `path/to/@chromatic-com/${e2ePackage}/bin/build-archive-storybook`
      );
      onTestFinished(revertPatch);

      const ctx = {
        ...baseContext,
        options: { [e2ePackage]: true, buildScriptName: 'build:storybook', inAction: false },
        sourceDir: './source-dir/',
        git: {},
        log: new TestLogger(),
      } as any;

      await setBuildCommand(ctx);
      expect(ctx.buildCommand).toEqual(
        `node path/to/@chromatic-com/${e2ePackage}/bin/build-archive-storybook --output-dir=./source-dir/`
      );
    }
  );
});

describe('buildStorybook', () => {
  it('runs the build command', async () => {
    const ctx = {
      ...baseContext,
      buildCommand: 'npm run build:storybook --script-args',
      env: { STORYBOOK_BUILD_TIMEOUT: 1000 },
      log: new TestLogger(),
      options: { storybookLogFile: 'build-storybook.log' },
    } as any;
    await buildStorybook(ctx);
    expect(ctx.buildLogFile).toMatch(/build-storybook\.log$/);
    const [cmd, ...args] = parseCommandString(ctx.buildCommand);
    expect(execa).toHaveBeenCalledWith(
      cmd,
      args,
      expect.objectContaining({ stdio: expect.any(Array) })
    );
    expect(ctx.log.debug).toHaveBeenCalledWith('Running build command:', ctx.buildCommand);
  });

  it('fails when build times out', async () => {
    const ctx = {
      ...baseContext,
      buildCommand: 'npm run build:storybook --script-args',
      options: { buildScriptName: '' },
      env: { STORYBOOK_BUILD_TIMEOUT: 0 },
      log: new TestLogger(),
    } as any;
    execa.mockReturnValue(new Promise((resolve) => setTimeout(resolve, 100)) as any);
    await expect(buildStorybook(ctx)).rejects.toThrow('Command failed');
    expect(ctx.log.error).toHaveBeenCalledWith(
      expect.stringContaining('Command timed out after 0ms')
    );
  });

  it('passes NODE_ENV=production', async () => {
    const ctx = {
      ...baseContext,
      buildCommand: 'npm run build:storybook --script-args',
      env: { STORYBOOK_BUILD_TIMEOUT: 1000 },
      log: new TestLogger(),
      options: { storybookLogFile: 'build-storybook.log' },
    } as any;
    await buildStorybook(ctx);
    const [cmd, ...args] = parseCommandString(ctx.buildCommand);
    expect(execa).toHaveBeenCalledWith(
      cmd,
      args,
      expect.objectContaining({
        env: { CI: '1', NODE_ENV: 'production', STORYBOOK_INVOKED_BY: 'chromatic' },
      })
    );
  });

  it('allows overriding NODE_ENV with STORYBOOK_NODE_ENV', async () => {
    const ctx = {
      ...baseContext,
      buildCommand: 'npm run build:storybook --script-args',
      env: { STORYBOOK_BUILD_TIMEOUT: 1000, STORYBOOK_NODE_ENV: 'test' },
      log: { debug: vi.fn() },
      options: { storybookLogFile: 'build-storybook.log' },
    } as any;
    await buildStorybook(ctx);
    const [cmd, ...args] = parseCommandString(ctx.buildCommand);
    expect(execa).toHaveBeenCalledWith(
      cmd,
      args,
      expect.objectContaining({
        env: { CI: '1', NODE_ENV: 'test', STORYBOOK_INVOKED_BY: 'chromatic' },
      })
    );
  });

  it('skips building for React Native apps', async () => {
    const ctx = {
      ...baseContext,
      isReactNativeApp: true,
      log: { debug: vi.fn() },
      options: { storybookBuildDir: '/path/to/rn-build' },
    } as any;
    await buildStorybook(ctx);
    expect(execa).not.toHaveBeenCalled();
  });

  it('skips the build for React Native apps when storybookBuildDir is provided and manifest.json exists', async () => {
    const ctx = {
      ...baseContext,
      isReactNativeApp: true,
      options: { storybookBuildDir: '/path/to/rn-build' },
    } as any;
    const task = buildTask(ctx);
    expect(task.skip).toBeDefined();
    const skipResult = await task.skip?.(ctx);
    expect(skipResult).toBe('Using prebuilt React Native assets');
    expect(ctx.sourceDir).toBe('/path/to/rn-build');
  });
});

describe('buildStorybook E2E', () => {
  // Error messages that we expect to result in the missing dependency error
  const missingDependencyErrorMessages = [
    { name: 'not found 1', error: 'Command not found: build-archive-storybook' },
    { name: 'not found 2', error: 'Command "build-archive-storybook" not found' },
    { name: 'npm not found', error: 'NPM error code E404\n\nMore error info' },
    {
      name: 'exit code not found',
      error: 'Command failed with exit code 127: some command\n\nsome error line\n\n',
    },
    {
      name: 'single line command failure',
      error:
        'Command failed with exit code 1: npm exec build-archive-storybook --output-dir /tmp/chromatic--4210-0cyodqfYZabe',
    },
  ];

  it.each(missingDependencyErrorMessages)(
    'fails with missing dependency error when error message is $name',
    async ({ error }) => {
      const ctx = {
        ...baseContext,
        buildCommand: 'npm exec build-archive-storybook',
        options: { buildScriptName: '', playwright: true },
        env: { STORYBOOK_BUILD_TIMEOUT: 0 },
        log: { debug: vi.fn(), error: vi.fn() },
      } as any;

      execa.mockRejectedValueOnce(new Error(error));
      await expect(buildStorybook(ctx)).rejects.toThrow('Command failed');
      expect(ctx.log.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to import `@chromatic-com/playwright`')
      );

      ctx.log.error.mockClear();
    }
  );

  it('fails with generic error message when not missing dependency error', async () => {
    const ctx = {
      ...baseContext,
      buildCommand: 'npm exec build-archive-storybook',
      options: { buildScriptName: '', playwright: true },
      env: { STORYBOOK_BUILD_TIMEOUT: 0 },
      log: { debug: vi.fn(), error: vi.fn() },
    } as any;

    const errorMessage =
      'Command failed with exit code 1: npm exec build-archive-storybook --output-dir /tmp/chromatic--4210-0cyodqfYZabe\n\nMore error message lines\n\nAnd more';
    execa.mockRejectedValueOnce(new Error(errorMessage));
    await expect(buildStorybook(ctx)).rejects.toThrow('Command failed');
    expect(ctx.log.error).not.toHaveBeenCalledWith(
      expect.stringContaining('Failed to import `@chromatic-com/playwright`')
    );
    expect(ctx.log.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to run `chromatic --playwright`')
    );
    expect(ctx.log.error).toHaveBeenCalledWith(expect.stringContaining(errorMessage));
  });
});

function makeAnalyticsContext(overrides = {}) {
  return {
    ...baseContext,
    buildCommand: 'npm run build:storybook',
    env: { STORYBOOK_BUILD_TIMEOUT: 0 },
    log: new TestLogger(),
    pkg: { version: '1.0.0' },
    storybook: { version: '8.0.0' },
    git: { gitUserEmail: 'test@example.com', ciService: 'github-actions' },
    announcedBuild: { app: { id: 'app-123', account: { id: 'account-456' } } },
    analytics: { trackEvent: vi.fn(), shutdown: vi.fn() },
    ...overrides,
  } as any;
}

describe('buildStorybook analytics', () => {
  it('tracks storybook_build_failed on build failure', async () => {
    // arrange
    const ctx = makeAnalyticsContext();
    execa.mockRejectedValueOnce(new Error('build failed'));

    // act
    await expect(buildStorybook(ctx)).rejects.toThrow();

    // assert
    expect(ctx.analytics.trackEvent).toHaveBeenCalledWith(
      AnalyticsEvent.CLI_STORYBOOK_BUILD_FAILED,
      expect.objectContaining({
        errorCategory: 'storybook_build_failed',
        buildCommand: 'npm run build:storybook',
        source: 'cli',
        cliVersion: '1.0.0',
        storybookVersion: '8.0.0',
        isCI: expect.any(Boolean),
        ciService: 'github-actions',
        gitUserEmailHash: expect.any(String),
      })
    );
  });

  it('tracks e2e_missing_dependency when E2E dependency is not found', async () => {
    // arrange
    const ctx = makeAnalyticsContext({ options: { playwright: true, buildScriptName: '' } });
    execa.mockRejectedValueOnce(new Error('Command not found: build-archive-storybook'));

    // act
    await expect(buildStorybook(ctx)).rejects.toThrow();

    // assert
    expect(ctx.analytics.trackEvent).toHaveBeenCalledWith(
      AnalyticsEvent.CLI_STORYBOOK_BUILD_FAILED,
      expect.objectContaining({ errorCategory: 'e2e_missing_dependency' })
    );
  });

  it('tracks e2e_build_failed on generic E2E build failure', async () => {
    // arrange
    const ctx = makeAnalyticsContext({ options: { playwright: true, buildScriptName: '' } });
    const error = 'Command failed with exit code 1: build-archive-storybook\n\nMultiple lines';
    execa.mockRejectedValueOnce(new Error(`${error}\n\nOf error`));

    // act
    await expect(buildStorybook(ctx)).rejects.toThrow();

    // assert
    expect(ctx.analytics.trackEvent).toHaveBeenCalledWith(
      AnalyticsEvent.CLI_STORYBOOK_BUILD_FAILED,
      expect.objectContaining({ errorCategory: 'e2e_build_failed' })
    );
  });

  it('tracks aborted when build is cancelled via abort signal', async () => {
    // arrange
    const controller = new AbortController();
    controller.abort();
    const ctx = makeAnalyticsContext({
      options: { experimental_abortSignal: controller.signal, buildScriptName: '' },
    });
    execa.mockRejectedValueOnce(new Error('aborted'));

    // act
    await expect(buildStorybook(ctx)).rejects.toThrow();

    // assert
    expect(ctx.analytics.trackEvent).toHaveBeenCalledWith(
      AnalyticsEvent.CLI_STORYBOOK_BUILD_FAILED,
      expect.objectContaining({ errorCategory: 'aborted' })
    );
  });

  it('sanitizes the stack trace before sending', async () => {
    // arrange
    const ctx = makeAnalyticsContext();
    const err = new Error('build failed');
    err.stack = 'Error: build failed\n    at x (/Users/user/secret/project/file.js:1:1)';
    execa.mockRejectedValueOnce(err);

    // act
    await expect(buildStorybook(ctx)).rejects.toThrow();

    // assert
    expect(ctx.analytics.trackEvent).toHaveBeenCalledWith(
      AnalyticsEvent.CLI_STORYBOOK_BUILD_FAILED,
      expect.objectContaining({
        stackTrace: 'Error: build failed\n    at x (<path>/file.js:1:1)',
      })
    );
  });

  it('reports to Sentry and still throws the build failure when analytics throws', async () => {
    // arrange
    vi.mocked(Sentry.captureException).mockClear();
    const analyticsError = new Error('analytics exploded');
    const ctx = makeAnalyticsContext({
      analytics: {
        trackEvent: vi.fn(() => {
          throw analyticsError;
        }),
        shutdown: vi.fn(),
      },
    });
    execa.mockRejectedValueOnce(new Error('build failed'));

    // act
    const thrown = await buildStorybook(ctx).catch((err) => err);

    // assert: outer throw is the build failure, not the analytics failure
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBe(analyticsError);
    expect(Sentry.captureException).toHaveBeenCalledWith(analyticsError);
  });
});

describe('buildReactNativeArtifacts', () => {
  const task = { title: '', output: '' } as any;

  beforeEach(() => {
    mockLogStream.write.mockClear();
    mockLogStream.end.mockClear();
    mockLogStream.on.mockClear();
    mockLogStream.on.mockImplementation((event: string, callback: () => void) => {
      if (event === 'open') callback();
    });
  });

  it('returns early when neither platform needs building', async () => {
    const ctx = { ...baseContext, isReactNativeApp: false, log: new TestLogger() } as any;
    await buildReactNativeArtifacts(ctx, task);
    expect(buildAndroid).not.toHaveBeenCalled();
    expect(buildIos).not.toHaveBeenCalled();
  });

  it('sets ctx.reactNativeBuildLogFile and creates the .chromatic directory', async () => {
    const { mkdirSync } = await import('fs');
    const ctx = {
      ...baseContext,
      isReactNativeApp: true,
      announcedBuild: { browsers: ['android'] },
      log: new TestLogger(),
      sourceDir: '/path/to/build',
    } as any;
    await buildReactNativeArtifacts(ctx, task);
    expect(vi.mocked(mkdirSync)).toHaveBeenCalledWith('/path/to/build/.chromatic', {
      recursive: true,
    });
    expect(ctx.reactNativeBuildLogFile).toBe('/path/to/build/.chromatic/react-native-build.log');
  });

  it('calls buildAndroid and moves artifact when android is in browsers', async () => {
    const { renameSync } = await import('fs');
    const ctx = {
      ...baseContext,
      isReactNativeApp: true,
      announcedBuild: { browsers: ['android'] },
      log: new TestLogger(),
      sourceDir: '/path/to/build',
    } as any;
    await buildReactNativeArtifacts(ctx, task);
    expect(buildAndroid).toHaveBeenCalledWith(mockLogStream);
    expect(vi.mocked(renameSync)).toHaveBeenCalledWith(
      '/tmp/app-release.apk',
      '/path/to/build/storybook.apk'
    );
  });

  it('reads expo config and calls buildIos when ios is in browsers', async () => {
    const { renameSync } = await import('fs');
    const ctx = {
      ...baseContext,
      isReactNativeApp: true,
      announcedBuild: { browsers: ['ios'] },
      log: new TestLogger(),
      options: {},
      sourceDir: '/path/to/build',
    } as any;
    await buildReactNativeArtifacts(ctx, task);
    expect(readExpoConfig).toHaveBeenCalled();
    expect(buildIos).toHaveBeenCalledWith('MyApp', mockLogStream);
    expect(vi.mocked(renameSync)).toHaveBeenCalledWith(
      '/tmp/MyApp.app',
      '/path/to/build/storybook.app'
    );
  });

  it('uses androidBuildCommand when set and does not call buildAndroid', async () => {
    const ctx = {
      ...baseContext,
      isReactNativeApp: true,
      announcedBuild: { browsers: ['android'] },
      log: new TestLogger(),
      options: { reactNative: { androidBuildCommand: 'my-android-build' } },
      sourceDir: '/path/to/build',
    } as any;
    await buildReactNativeArtifacts(ctx, task);
    expect(buildAndroid).not.toHaveBeenCalled();
    const [cmd, ...args] = parseCommandString('my-android-build');
    expect(execa).toHaveBeenCalledWith(cmd, args, expect.anything());
  });

  it('uses iosBuildCommand when set and does not call buildIos or readExpoConfig', async () => {
    const ctx = {
      ...baseContext,
      isReactNativeApp: true,
      announcedBuild: { browsers: ['ios'] },
      log: new TestLogger(),
      options: { reactNative: { iosBuildCommand: 'my-ios-build' } },
      sourceDir: '/path/to/build',
    } as any;
    await buildReactNativeArtifacts(ctx, task);
    expect(buildIos).not.toHaveBeenCalled();
    expect(readExpoConfig).not.toHaveBeenCalled();
    const [cmd, ...args] = parseCommandString('my-ios-build');
    expect(execa).toHaveBeenCalledWith(cmd, args, expect.anything());
  });

  it('closes the log stream after a successful build', async () => {
    const ctx = {
      ...baseContext,
      isReactNativeApp: true,
      announcedBuild: { browsers: ['android'] },
      log: new TestLogger(),
      sourceDir: '/path/to/build',
    } as any;
    await buildReactNativeArtifacts(ctx, task);
    expect(mockLogStream.end).toHaveBeenCalled();
  });

  it('closes the log stream and includes a truncated tail on build error', async () => {
    buildAndroid.mockRejectedValueOnce(new Error('Gradle build failed'));
    const ctx = {
      ...baseContext,
      isReactNativeApp: true,
      announcedBuild: { browsers: ['android'] },
      log: new TestLogger(),
      sourceDir: '/path/to/build',
    } as any;
    await expect(buildReactNativeArtifacts(ctx, task)).rejects.toThrow(
      'Build failed, see logs at /path/to/build/.chromatic/react-native-build.log'
    );
    expect(mockLogStream.end).toHaveBeenCalled();
  });

  it('skips when storybookBuildDir is set', async () => {
    const ctx = {
      ...baseContext,
      isReactNativeApp: true,
      announcedBuild: { browsers: ['android', 'ios'] },
      log: new TestLogger(),
      options: { storybookBuildDir: '/path/to/build' },
    } as any;
    await buildReactNativeArtifacts(ctx, task);
    expect(buildAndroid).not.toHaveBeenCalled();
    expect(buildIos).not.toHaveBeenCalled();
  });
});

describe('generateManifestForReactNative', () => {
  it('generates manifest for React Native apps', async () => {
    const ctx = {
      ...baseContext,
      isReactNativeApp: true,
      log: { debug: vi.fn() },
      options: { storybookBuildDir: '/path/to/rn-build' },
    } as any;
    await generateManifestForReactNative(ctx);
    expect(generateManifest).toHaveBeenCalledWith(ctx);
  });

  it('skips manifest generation for non-React Native apps', async () => {
    const ctx = {
      ...baseContext,
      isReactNativeApp: false,
      log: { debug: vi.fn() },
      options: { storybookBuildDir: '/path/to/build' },
    } as any;
    await generateManifestForReactNative(ctx);
    expect(generateManifest).not.toHaveBeenCalled();
  });
});
