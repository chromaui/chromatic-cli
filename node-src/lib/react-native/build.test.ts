import { execa as execaDefault } from 'execa';
import { type WriteStream } from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildAndroid, buildIos } from './build';

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

beforeEach(() => {
  execa.mockClear();
  execa.mockResolvedValue(undefined as any);
});

describe('buildAndroid', () => {
  it('calls expo prebuild and gradlew with Storybook env vars', async () => {
    const logStream = makeLogStream();
    await buildAndroid(logStream);
    expect(execa).toHaveBeenCalledWith(
      'npx',
      ['expo', 'prebuild', '--platform', 'android'],
      expect.objectContaining({
        env: expect.objectContaining({
          STORYBOOK_ENABLED: 'true',
          STORYBOOK_WEBSOCKET_HOST: 'react-native.capture.chromatic.com',
          STORYBOOK_DISABLE_UI: 'true',
        }),
      })
    );
    expect(execa).toHaveBeenCalledWith(
      './gradlew',
      ['assembleRelease'],
      expect.objectContaining({ cwd: expect.stringContaining('android') })
    );
  });

  it('writes command headers to the log stream', async () => {
    const logStream = makeLogStream();
    await buildAndroid(logStream);
    expect(logStream.write).toHaveBeenCalledWith(
      expect.stringContaining('[chromatic] Android build: npx expo prebuild')
    );
    expect(logStream.write).toHaveBeenCalledWith(
      expect.stringContaining('[chromatic] Android build: ./gradlew assembleRelease')
    );
  });

  it('returns the APK path and duration on success', async () => {
    const result = await buildAndroid(makeLogStream());
    expect(result.artifactPath).toMatch(/app-release\.apk$/);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('throws when the APK is not found after build', async () => {
    const { existsSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValueOnce(false);
    await expect(buildAndroid(makeLogStream())).rejects.toThrow('Expected APK not found at');
  });
});

describe('buildIos', () => {
  it('throws when not on macOS', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    try {
      await expect(buildIos('MyApp', makeLogStream())).rejects.toThrow(
        'iOS builds are only supported on macOS.'
      );
    } finally {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
    }
  });

  it('calls expo prebuild and xcodebuild with correct args on macOS', async () => {
    if (process.platform !== 'darwin') return;

    const logStream = makeLogStream();
    await buildIos('MyApp', logStream);

    expect(execa).toHaveBeenCalledWith(
      'npx',
      ['expo', 'prebuild', '--platform', 'ios'],
      expect.objectContaining({
        env: expect.objectContaining({
          STORYBOOK_ENABLED: 'true',
        }),
      })
    );
    expect(execa).toHaveBeenCalledWith(
      'xcodebuild',
      expect.arrayContaining(['-scheme', 'MyApp', '-sdk', 'iphonesimulator']),
      expect.objectContaining({ cwd: expect.stringContaining('ios') })
    );
  });

  it('writes command headers to the log stream on macOS', async () => {
    if (process.platform !== 'darwin') return;

    const logStream = makeLogStream();
    await buildIos('MyApp', logStream);
    expect(logStream.write).toHaveBeenCalledWith(
      expect.stringContaining('[chromatic] iOS build: npx expo prebuild')
    );
    expect(logStream.write).toHaveBeenCalledWith(
      expect.stringContaining('[chromatic] iOS build: xcodebuild')
    );
  });

  it('returns the .app path and duration on macOS', async () => {
    if (process.platform !== 'darwin') return;

    const result = await buildIos('MyApp', makeLogStream());
    expect(result.artifactPath).toMatch(/MyApp\.app$/);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('throws when the .app bundle is not found after build', async () => {
    if (process.platform !== 'darwin') return;

    const { existsSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValueOnce(false);
    await expect(buildIos('MyApp', makeLogStream())).rejects.toThrow(
      'Expected .app bundle not found at'
    );
  });
});
