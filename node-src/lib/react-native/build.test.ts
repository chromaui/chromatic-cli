import { execa as execaDefault } from 'execa';
import { type WriteStream } from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildAndroid, buildIos, execWithBuildEnvironment } from './build';

vi.mock('execa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('execa')>();
  return { ...actual, execa: vi.fn(() => Promise.resolve()) };
});

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    mkdtempSync: vi.fn((prefix: string) => `${prefix}test`),
    renameSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

const execa = vi.mocked(execaDefault);

const makeLogStream = () => ({ write: vi.fn(), end: vi.fn() }) as unknown as WriteStream;

async function mockedProcessPlatform(platform: string, fn: () => Promise<void>) {
  const originalPlatform = process.platform;
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  try {
    await fn();
  } finally {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
  }
}

const expectedBuildEnvironment = {
  STORYBOOK_ENABLED: 'true',
  EXPO_PUBLIC_STORYBOOK_ENABLED: 'true',

  STORYBOOK_DISABLE_UI: 'true',
  EXPO_PUBLIC_STORYBOOK_DISABLE_UI: 'true',

  STORYBOOK_SERVER: 'false',
  EXPO_STORYBOOK_SERVER: 'false',

  STORYBOOK_WEBSOCKET_HOST: 'react-native.capture.chromatic.com',
  EXPO_PUBLIC_STORYBOOK_WEBSOCKET_HOST: 'react-native.capture.chromatic.com',
  STORYBOOK_WS_HOST: 'react-native.capture.chromatic.com',
  EXPO_PUBLIC_STORYBOOK_WS_HOST: 'react-native.capture.chromatic.com',

  STORYBOOK_WEBSOCKET_PORT: '7007',
  EXPO_PUBLIC_STORYBOOK_WEBSOCKET_PORT: '7007',
  STORYBOOK_WS_PORT: '7007',
  EXPO_PUBLIC_STORYBOOK_WS_PORT: '7007',

  STORYBOOK_WEBSOCKET_SECURED: 'true',
  EXPO_PUBLIC_STORYBOOK_WEBSOCKET_SECURED: 'true',
  STORYBOOK_WS_SECURED: 'true',
  EXPO_PUBLIC_STORYBOOK_WS_SECURED: 'true',
};

beforeEach(() => {
  execa.mockClear();
  execa.mockResolvedValue(undefined as any);
});

describe('execWithBuildEnvironment', () => {
  it('passes the full set of Storybook environment variables', async () => {
    const logStream = makeLogStream();
    await execWithBuildEnvironment('echo', [], {}, logStream);

    expect(execa).toHaveBeenCalledWith(
      'echo',
      [],
      expect.objectContaining({ env: expectedBuildEnvironment })
    );
  });

  it('merges caller-supplied env vars without overriding Storybook vars', async () => {
    const logStream = makeLogStream();
    await execWithBuildEnvironment(
      'echo',
      [],
      { env: { STORYBOOK_WS_HOST: 'this.would.break.chromatic', MY_VAR: 'hello' } },
      logStream
    );

    expect(execa).toHaveBeenCalledWith(
      'echo',
      [],
      expect.objectContaining({
        env: expect.objectContaining({
          MY_VAR: 'hello',
          ...expectedBuildEnvironment,
        }),
      })
    );
  });
});

describe('buildAndroid', () => {
  it('calls expo prebuild and gradlew with Storybook env vars', async () => {
    const logStream = makeLogStream();
    await buildAndroid('/tmp/out/storybook.apk', logStream);
    expect(execa).toHaveBeenCalledWith(
      'npx',
      ['expo', 'prebuild', '--platform', 'android'],
      expect.objectContaining({
        env: expect.objectContaining(expectedBuildEnvironment),
      })
    );
    expect(execa).toHaveBeenCalledWith(
      './gradlew',
      ['assembleRelease', '-PreactNativeArchitectures=x86_64'],
      expect.objectContaining({ cwd: expect.stringContaining('android') })
    );
  });

  it('writes command headers to the log stream', async () => {
    const logStream = makeLogStream();
    await buildAndroid('/tmp/out/storybook.apk', logStream);
    expect(logStream.write).toHaveBeenCalledWith(
      expect.stringContaining('[chromatic] Android build: npx expo prebuild')
    );
    expect(logStream.write).toHaveBeenCalledWith(
      expect.stringContaining(
        '[chromatic] Android build: ./gradlew assembleRelease -PreactNativeArchitectures=x86_64'
      )
    );
  });

  it('moves the APK to outputPath and returns duration on success', async () => {
    const { renameSync } = await import('fs');
    const duration = await buildAndroid('/tmp/out/storybook.apk', makeLogStream());
    expect(duration).toBeGreaterThanOrEqual(0);
    expect(vi.mocked(renameSync)).toHaveBeenCalledWith(
      expect.stringContaining('app-release.apk'),
      '/tmp/out/storybook.apk'
    );
  });

  it('throws when the APK is not found after build', async () => {
    const { existsSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValueOnce(true).mockReturnValueOnce(false);
    await expect(buildAndroid('/tmp/out/storybook.apk', makeLogStream())).rejects.toThrow(
      'Expected APK not found at'
    );
  });

  it('throws when the output directory does not exist', async () => {
    const { existsSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValueOnce(false);
    await expect(buildAndroid('/nonexistent/dir/storybook.apk', makeLogStream())).rejects.toThrow(
      'Output directory does not exist'
    );
  });
});

describe('buildIos', () => {
  it('throws when not on macOS', async () => {
    await mockedProcessPlatform('linux', async () => {
      await expect(buildIos('MyApp', '/tmp/out/MyApp.app', makeLogStream())).rejects.toThrow(
        'iOS builds are only supported on macOS.'
      );
    });
  });

  it('calls expo prebuild and xcodebuild with correct args on macOS', async () => {
    await mockedProcessPlatform('darwin', async () => {
      const logStream = makeLogStream();
      await buildIos('MyApp', '/tmp/out/MyApp.app', logStream);

      expect(execa).toHaveBeenCalledWith(
        'npx',
        ['expo', 'prebuild', '--platform', 'ios'],
        expect.objectContaining({
          env: expect.objectContaining(expectedBuildEnvironment),
        })
      );
      expect(execa).toHaveBeenCalledWith(
        'xcodebuild',
        expect.arrayContaining(['-scheme', 'MyApp', '-sdk', 'iphonesimulator']),
        expect.objectContaining({ cwd: expect.stringContaining('ios') })
      );
    });
  });

  it('writes command headers to the log stream on macOS', async () => {
    await mockedProcessPlatform('darwin', async () => {
      const logStream = makeLogStream();
      await buildIos('MyApp', '/tmp/out/MyApp.app', logStream);
      expect(logStream.write).toHaveBeenCalledWith(
        expect.stringContaining('[chromatic] iOS build: npx expo prebuild')
      );
      expect(logStream.write).toHaveBeenCalledWith(
        expect.stringContaining('[chromatic] iOS build: xcodebuild')
      );
    });
  });

  it('moves the .app to outputPath and returns duration on macOS', async () => {
    await mockedProcessPlatform('darwin', async () => {
      const { renameSync } = await import('fs');
      const duration = await buildIos('MyApp', '/tmp/out/MyApp.app', makeLogStream());
      expect(duration).toBeGreaterThanOrEqual(0);
      expect(vi.mocked(renameSync)).toHaveBeenCalledWith(
        expect.stringContaining('MyApp.app'),
        '/tmp/out/MyApp.app'
      );
    });
  });

  it('throws when the .app bundle is not found after build', async () => {
    await mockedProcessPlatform('darwin', async () => {
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValueOnce(true).mockReturnValueOnce(false);
      await expect(buildIos('MyApp', '/tmp/out/MyApp.app', makeLogStream())).rejects.toThrow(
        'Expected .app bundle not found at'
      );
    });
  });

  it('throws when the output directory does not exist', async () => {
    await mockedProcessPlatform('darwin', async () => {
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValueOnce(false);
      await expect(
        buildIos('MyApp', '/nonexistent/dir/MyApp.app', makeLogStream())
      ).rejects.toThrow('Output directory does not exist');
    });
  });
});
