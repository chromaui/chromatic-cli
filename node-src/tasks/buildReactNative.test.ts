import { execa as execaDefault, parseCommandString } from 'execa';
import { Readable } from 'stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildAndroid as buildAndroidDefault,
  buildIos as buildIosDefault,
} from '../lib/react-native/build';
import { readExpoConfig as readExpoConfigDefault } from '../lib/react-native/expoConfig';
import { generateManifest } from '../lib/react-native/generateManifest';
import TestLogger from '../lib/testLogger';
import buildReactNativeTask, { buildArtifacts, generateManifestStep } from './buildReactNative';

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

const execa = vi.mocked(execaDefault);
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

describe('buildReactNative task', () => {
  it('skips when not a React Native app', async () => {
    const ctx = { ...baseContext, isReactNativeApp: false } as any;
    const task = buildReactNativeTask(ctx);
    const skipResult = await task.skip?.(ctx);
    expect(skipResult).toBe(true);
  });

  it('skips with prebuilt message when storybookBuildDir is set and manifest.json exists', async () => {
    const ctx = {
      ...baseContext,
      isReactNativeApp: true,
      options: { storybookBuildDir: '/path/to/rn-build' },
    } as any;
    const task = buildReactNativeTask(ctx);
    const skipResult = await task.skip?.(ctx);
    expect(skipResult).toBe('Using prebuilt React Native assets');
    expect(ctx.sourceDir).toBe('/path/to/rn-build');
  });
});

describe('buildArtifacts', () => {
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
    const ctx = {
      ...baseContext,
      announcedBuild: { browsers: [] },
      log: new TestLogger(),
    } as any;
    await buildArtifacts(ctx, task);
    expect(buildAndroid).not.toHaveBeenCalled();
    expect(buildIos).not.toHaveBeenCalled();
  });

  it('sets ctx.reactNativeBuildLogFile and creates the .chromatic directory', async () => {
    const { mkdirSync } = await import('fs');
    const ctx = {
      ...baseContext,
      announcedBuild: { browsers: ['android'] },
      log: new TestLogger(),
      sourceDir: '/path/to/build',
    } as any;
    await buildArtifacts(ctx, task);
    expect(vi.mocked(mkdirSync)).toHaveBeenCalledWith('/path/to/build/.chromatic', {
      recursive: true,
    });
    expect(ctx.reactNativeBuildLogFile).toBe('/path/to/build/.chromatic/react-native-build.log');
  });

  it('calls buildAndroid and moves artifact when android is in browsers', async () => {
    const { renameSync } = await import('fs');
    const ctx = {
      ...baseContext,
      announcedBuild: { browsers: ['android'] },
      log: new TestLogger(),
      sourceDir: '/path/to/build',
    } as any;
    await buildArtifacts(ctx, task);
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
      announcedBuild: { browsers: ['ios'] },
      log: new TestLogger(),
      options: {},
      sourceDir: '/path/to/build',
    } as any;
    await buildArtifacts(ctx, task);
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
      announcedBuild: { browsers: ['android'] },
      log: new TestLogger(),
      options: { reactNative: { androidBuildCommand: 'my-android-build' } },
      sourceDir: '/path/to/build',
    } as any;
    await buildArtifacts(ctx, task);
    expect(buildAndroid).not.toHaveBeenCalled();
    const [cmd, ...args] = parseCommandString('my-android-build');
    expect(execa).toHaveBeenCalledWith(cmd, args, expect.anything());
  });

  it('uses iosBuildCommand when set and does not call buildIos or readExpoConfig', async () => {
    const ctx = {
      ...baseContext,
      announcedBuild: { browsers: ['ios'] },
      log: new TestLogger(),
      options: { reactNative: { iosBuildCommand: 'my-ios-build' } },
      sourceDir: '/path/to/build',
    } as any;
    await buildArtifacts(ctx, task);
    expect(buildIos).not.toHaveBeenCalled();
    expect(readExpoConfig).not.toHaveBeenCalled();
    const [cmd, ...args] = parseCommandString('my-ios-build');
    expect(execa).toHaveBeenCalledWith(cmd, args, expect.anything());
  });

  it('closes the log stream after a successful build', async () => {
    const ctx = {
      ...baseContext,
      announcedBuild: { browsers: ['android'] },
      log: new TestLogger(),
      sourceDir: '/path/to/build',
    } as any;
    await buildArtifacts(ctx, task);
    expect(mockLogStream.end).toHaveBeenCalled();
  });

  it('closes the log stream and includes a truncated tail on build error', async () => {
    buildAndroid.mockRejectedValueOnce(new Error('Gradle build failed'));
    const ctx = {
      ...baseContext,
      announcedBuild: { browsers: ['android'] },
      log: new TestLogger(),
      sourceDir: '/path/to/build',
    } as any;
    await expect(buildArtifacts(ctx, task)).rejects.toThrow(
      'Build failed, see logs at /path/to/build/.chromatic/react-native-build.log'
    );
    expect(mockLogStream.end).toHaveBeenCalled();
  });
});

describe('generateManifestStep', () => {
  it('generates manifest', async () => {
    const ctx = {
      ...baseContext,
      log: { debug: vi.fn() },
    } as any;
    await generateManifestStep(ctx);
    expect(generateManifest).toHaveBeenCalledWith(ctx);
  });
});
