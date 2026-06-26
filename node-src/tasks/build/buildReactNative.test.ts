import { execa as execaDefault, parseCommandString } from 'execa';
import { Readable } from 'stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildAndroid as buildAndroidDefault,
  buildIos as buildIosDefault,
} from '../../lib/react-native/build';
import { readExpoConfig as readExpoConfigDefault } from '../../lib/react-native/expoConfig';
import { generateManifest } from '../../lib/react-native/generateManifest';
import { exitCodes } from '../../lib/setExitCode';
import TestLogger from '../../lib/testLogger';
import { buildArtifacts, generateManifestStep } from './buildReactNative';

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
vi.mock('../../lib/react-native/build', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/react-native/build')>();
  return {
    ...actual,
    buildAndroid: vi.fn(() => Promise.resolve(1)),
    buildIos: vi.fn(() => Promise.resolve(1)),
  };
});
vi.mock('../../lib/react-native/expoConfig', () => ({
  readExpoConfig: vi.fn(() => Promise.resolve({ platforms: ['ios', 'android'], name: 'MyApp' })),
}));
vi.mock('../../lib/react-native/generateManifest', () => ({
  generateManifest: vi.fn(() => Promise.resolve()),
}));

const execa = vi.mocked(execaDefault);
const buildAndroid = vi.mocked(buildAndroidDefault);
const buildIos = vi.mocked(buildIosDefault);
const readExpoConfig = vi.mocked(readExpoConfigDefault);

function makeDeps(overrides = {}) {
  return { options: {}, log: new TestLogger(), report: vi.fn(), ...overrides } as any;
}

beforeEach(() => {
  execa.mockClear();
  buildAndroid.mockClear();
  buildIos.mockClear();
  readExpoConfig.mockClear();
});

describe('buildArtifacts', () => {
  beforeEach(() => {
    mockLogStream.write.mockClear();
    mockLogStream.end.mockClear();
    mockLogStream.on.mockClear();
    mockLogStream.on.mockImplementation((event: string, callback: () => void) => {
      if (event === 'open') callback();
    });
  });

  it('throws when no valid platforms are in browsers', async () => {
    await expect(
      buildArtifacts(makeDeps(), { sourceDir: '/path/to/build', browsers: [] })
    ).rejects.toMatchObject({
      name: 'TaskFailure',
      exitCode: exitCodes.NPM_BUILD_STORYBOOK_FAILED,
      message:
        'Unable to build for React Native, your project does not include any supported platforms',
    });
    expect(buildAndroid).not.toHaveBeenCalled();
    expect(buildIos).not.toHaveBeenCalled();
  });

  it('returns reactNativeBuildLogFile and creates the .chromatic directory', async () => {
    const { mkdirSync } = await import('fs');
    const { reactNativeBuildLogFile } = await buildArtifacts(makeDeps(), {
      sourceDir: '/path/to/build',
      browsers: ['android'],
    });
    expect(vi.mocked(mkdirSync)).toHaveBeenCalledWith('/path/to/build/.chromatic', {
      recursive: true,
    });
    expect(reactNativeBuildLogFile).toBe('/path/to/build/.chromatic/react-native-build.log');
  });

  it('calls buildAndroid with output path when android is in browsers', async () => {
    await buildArtifacts(makeDeps(), { sourceDir: '/path/to/build', browsers: ['android'] });
    expect(buildAndroid).toHaveBeenCalledWith(
      '/path/to/build/storybook.apk',
      mockLogStream,
      undefined
    );
  });

  it('passes androidBuildArchitectures to buildAndroid', async () => {
    const deps = makeDeps({
      options: { reactNative: { androidBuildArchitectures: ['arm64-v8a'] } },
    });
    await buildArtifacts(deps, { sourceDir: '/path/to/build', browsers: ['android'] });
    expect(buildAndroid).toHaveBeenCalledWith('/path/to/build/storybook.apk', mockLogStream, [
      'arm64-v8a',
    ]);
  });

  it('reads expo config and calls buildIos with output path when ios is in browsers', async () => {
    await buildArtifacts(makeDeps(), { sourceDir: '/path/to/build', browsers: ['ios'] });
    expect(readExpoConfig).toHaveBeenCalled();
    expect(buildIos).toHaveBeenCalledWith('MyApp', '/path/to/build/storybook.app', mockLogStream);
  });

  it('uses androidBuildCommand when set and does not call buildAndroid', async () => {
    const deps = makeDeps({
      options: { reactNative: { androidBuildCommand: 'my-android-build' } },
    });
    await buildArtifacts(deps, { sourceDir: '/path/to/build', browsers: ['android'] });
    expect(buildAndroid).not.toHaveBeenCalled();
    const [cmd, ...args] = parseCommandString('my-android-build');
    expect(execa).toHaveBeenCalledWith(
      cmd,
      args,
      expect.objectContaining({
        env: expect.objectContaining({ CHROMATIC_ARTIFACT_DIRECTORY: '/path/to/build' }),
      })
    );
  });

  it('splits androidBuildCommand into executable and arguments before spawning', async () => {
    const deps = makeDeps({
      options: { reactNative: { androidBuildCommand: 'yarn android -t remote -m release' } },
    });
    await buildArtifacts(deps, { sourceDir: '/path/to/build', browsers: ['android'] });
    expect(execa).toHaveBeenCalledWith(
      'yarn',
      ['android', '-t', 'remote', '-m', 'release'],
      expect.objectContaining({
        env: expect.objectContaining({ CHROMATIC_ARTIFACT_DIRECTORY: '/path/to/build' }),
      })
    );
  });

  it('ignores androidBuildArchitectures when androidBuildCommand is set and logs debug message', async () => {
    const deps = makeDeps({
      options: {
        reactNative: {
          androidBuildCommand: 'my-android-build',
          androidBuildArchitectures: ['arm64-v8a'],
        },
      },
    });
    await buildArtifacts(deps, { sourceDir: '/path/to/build', browsers: ['android'] });
    expect(buildAndroid).not.toHaveBeenCalled();
    expect(deps.log.debug).toHaveBeenCalledWith(
      'androidBuildArchitectures is ignored when androidBuildCommand is set'
    );
  });

  it('uses iosBuildCommand when set and does not call buildIos or readExpoConfig', async () => {
    const deps = makeDeps({ options: { reactNative: { iosBuildCommand: 'my-ios-build' } } });
    await buildArtifacts(deps, { sourceDir: '/path/to/build', browsers: ['ios'] });
    expect(buildIos).not.toHaveBeenCalled();
    expect(readExpoConfig).not.toHaveBeenCalled();
    const [cmd, ...args] = parseCommandString('my-ios-build');
    expect(execa).toHaveBeenCalledWith(
      cmd,
      args,
      expect.objectContaining({
        env: expect.objectContaining({ CHROMATIC_ARTIFACT_DIRECTORY: '/path/to/build' }),
      })
    );
  });

  it('splits iosBuildCommand into executable and arguments before spawning', async () => {
    const deps = makeDeps({
      options: { reactNative: { iosBuildCommand: 'yarn ios -t remote -m release' } },
    });
    await buildArtifacts(deps, { sourceDir: '/path/to/build', browsers: ['ios'] });
    expect(execa).toHaveBeenCalledWith(
      'yarn',
      ['ios', '-t', 'remote', '-m', 'release'],
      expect.objectContaining({
        env: expect.objectContaining({ CHROMATIC_ARTIFACT_DIRECTORY: '/path/to/build' }),
      })
    );
  });

  it('calls buildAndroid and buildIos when both are in browsers', async () => {
    await buildArtifacts(makeDeps(), {
      sourceDir: '/path/to/build',
      browsers: ['android', 'ios'],
    });
    expect(buildAndroid).toHaveBeenCalledWith(
      '/path/to/build/storybook.apk',
      mockLogStream,
      undefined
    );
    expect(readExpoConfig).toHaveBeenCalled();
    expect(buildIos).toHaveBeenCalledWith('MyApp', '/path/to/build/storybook.app', mockLogStream);
  });

  it('closes the log stream after a successful build', async () => {
    await buildArtifacts(makeDeps(), { sourceDir: '/path/to/build', browsers: ['android'] });
    expect(mockLogStream.end).toHaveBeenCalled();
  });

  it('closes the log stream and includes a truncated tail on build error', async () => {
    buildAndroid.mockRejectedValueOnce(new Error('Gradle build failed'));
    await expect(
      buildArtifacts(makeDeps(), { sourceDir: '/path/to/build', browsers: ['android'] })
    ).rejects.toThrow('Build failed, see logs at /path/to/build/.chromatic/react-native-build.log');
    expect(mockLogStream.end).toHaveBeenCalled();
  });
});

describe('generateManifestStep', () => {
  it('generates manifest', async () => {
    const deps = { log: { debug: vi.fn() }, options: {} } as any;
    await generateManifestStep(deps, { sourceDir: '/path/to/build' });
    expect(generateManifest).toHaveBeenCalledWith(deps, { sourceDir: '/path/to/build' });
  });
});
