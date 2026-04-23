import { execa as execaDefault } from 'execa';
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

beforeEach(() => {
  execa.mockClear();
  execa.mockResolvedValue(undefined as any);
});

describe('buildAndroid', () => {
  it('calls expo prebuild and gradlew with Storybook env vars', async () => {
    await buildAndroid();
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

  it('returns the APK path and duration on success', async () => {
    const result = await buildAndroid();
    expect(result.artifactPath).toMatch(/app-release\.apk$/);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('throws when the APK is not found after build', async () => {
    const { existsSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValueOnce(false);
    await expect(buildAndroid()).rejects.toThrow('Expected APK not found at');
  });
});

describe('buildIos', () => {
  it('throws when scheme is undefined', async () => {
    await expect(buildIos(undefined)).rejects.toThrow(
      'Unable to determine scheme for iOS build.'
    );
  });

  it('throws when not on macOS', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    try {
      await expect(buildIos('MyApp')).rejects.toThrow('iOS builds are only supported on macOS.');
    } finally {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
    }
  });

  it('calls expo prebuild and xcodebuild with correct args on macOS', async () => {
    if (process.platform !== 'darwin') return;

    await buildIos('MyApp');

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

  it('returns the .app path and duration on macOS', async () => {
    if (process.platform !== 'darwin') return;

    const result = await buildIos('MyApp');
    expect(result.artifactPath).toMatch(/MyApp\.app$/);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('throws when the .app bundle is not found after build', async () => {
    if (process.platform !== 'darwin') return;

    const { existsSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValueOnce(false);
    await expect(buildIos('MyApp')).rejects.toThrow('Expected .app bundle not found at');
  });
});
