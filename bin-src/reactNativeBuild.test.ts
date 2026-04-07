import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(),
      mkdtempSync: vi.fn(),
      createWriteStream: vi.fn(),
      rmSync: vi.fn(),
    },
    existsSync: vi.fn(),
    mkdtempSync: vi.fn(),
    createWriteStream: vi.fn(),
    rmSync: vi.fn(),
  };
});

import { execa } from 'execa';
import fs from 'fs';

import { main } from './reactNativeBuild';

const mockedExeca = vi.mocked(execa);
const mockedExistsSync = vi.mocked(fs.existsSync);
const mockedMkdtempSync = vi.mocked(fs.mkdtempSync);
const mockedCreateWriteStream = vi.mocked(fs.createWriteStream);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit');
  });

  mockedMkdtempSync.mockReturnValue('/tmp/chromatic-rn-test');
  mockedCreateWriteStream.mockReturnValue({ close: vi.fn() } as any);
});

describe('react-native-build', () => {
  it('reads expo config and builds android', async () => {
    mockedExeca.mockImplementation((command: any, args: any) => {
      if (command === 'npx' && args?.[0] === 'expo' && args?.[1] === 'config') {
        return { stdout: JSON.stringify({ platforms: ['android'], scheme: 'MyApp' }) } as any;
      }
      return Promise.resolve({}) as any;
    });
    mockedExistsSync.mockReturnValue(true);

    await main([]);

    expect(mockedExeca).toHaveBeenCalledWith('npx', ['expo', 'config', '--json']);
    expect(mockedExeca).toHaveBeenCalledWith(
      'npx',
      ['expo', 'prebuild', '--platform', 'android'],
      expect.objectContaining({})
    );
    expect(mockedExeca).toHaveBeenCalledWith('./gradlew', ['assembleRelease'], expect.objectContaining({ cwd: expect.stringContaining('android') }));
  });

  it('reads expo config and builds ios on darwin', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin' });

    mockedExeca.mockImplementation((command: any, args: any) => {
      if (command === 'npx' && args?.[0] === 'expo' && args?.[1] === 'config') {
        return { stdout: JSON.stringify({ platforms: ['ios'], scheme: 'MyApp' }) } as any;
      }
      return Promise.resolve({}) as any;
    });
    mockedExistsSync.mockReturnValue(true);

    await main([]);

    expect(mockedExeca).toHaveBeenCalledWith(
      'xcodebuild',
      expect.arrayContaining([
        '-workspace',
        'MyApp.xcworkspace',
        '-scheme',
        'MyApp',
        'CODE_SIGNING_ALLOWED=NO',
      ]),
      expect.objectContaining({ cwd: expect.stringContaining('ios') })
    );

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('exits with error when expo config fails', async () => {
    mockedExeca.mockRejectedValue(new Error('expo not found'));

    await expect(main([])).rejects.toThrow('process.exit');
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to read Expo config')
    );
  });

  it('exits with error when no supported platforms found', async () => {
    mockedExeca.mockImplementation((command: any, args: any) => {
      if (command === 'npx' && args?.[0] === 'expo' && args?.[1] === 'config') {
        return { stdout: JSON.stringify({ platforms: [], scheme: 'MyApp' }) } as any;
      }
      return Promise.resolve({}) as any;
    });

    await expect(main([])).rejects.toThrow('process.exit');
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('No supported platforms found')
    );
  });

  it('exits with error when ios platform has no scheme', async () => {
    mockedExeca.mockImplementation((command: any, args: any) => {
      if (command === 'npx' && args?.[0] === 'expo' && args?.[1] === 'config') {
        return { stdout: JSON.stringify({ platforms: ['ios'] }) } as any;
      }
      return Promise.resolve({}) as any;
    });

    await expect(main([])).rejects.toThrow('process.exit');
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('No scheme found')
    );
  });

  it('skips ios on non-darwin platforms', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux' });

    mockedExeca.mockImplementation((command: any, args: any) => {
      if (command === 'npx' && args?.[0] === 'expo' && args?.[1] === 'config') {
        return { stdout: JSON.stringify({ platforms: ['ios'], scheme: 'MyApp' }) } as any;
      }
      return Promise.resolve({}) as any;
    });

    await expect(main([])).rejects.toThrow('process.exit');
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('iOS builds are only supported on macOS')
    );

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('exits when android build fails', async () => {
    mockedExeca.mockImplementation((command: any, args: any) => {
      if (command === 'npx' && args?.[0] === 'expo' && args?.[1] === 'config') {
        return { stdout: JSON.stringify({ platforms: ['android'], scheme: 'MyApp' }) } as any;
      }
      if (command === 'npx' && args?.[0] === 'expo' && args?.[1] === 'prebuild') {
        return Promise.resolve({}) as any;
      }
      if (command === './gradlew') {
        return Promise.reject(new Error('gradle failed')) as any;
      }
      return Promise.resolve({}) as any;
    });

    await expect(main([])).rejects.toThrow('process.exit');
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Build command failed')
    );
  });
});
