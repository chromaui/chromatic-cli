import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  const existsSync = vi.fn();
  const mkdtempSync = vi.fn();
  const rmSync = vi.fn();
  const renameSync = vi.fn();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync,
      mkdtempSync,
      rmSync,
      renameSync,
    },
    existsSync,
    mkdtempSync,
    rmSync,
    renameSync,
  };
});

import { execa } from 'execa';
import fs from 'fs';

import { main } from './reactNativeBuild';

const mockedExeca = vi.mocked(execa);
const mockedExistsSync = vi.mocked(fs.existsSync);
const mockedMkdtempSync = vi.mocked(fs.mkdtempSync);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit');
  });

  mockedMkdtempSync.mockReturnValue('/tmp/chromatic-rn-test' as any);
});

describe('react-native-build', () => {
  it('reads expo config and builds android', async () => {
    mockedExeca.mockImplementation((command: any, args: any) => {
      if (command === 'npx' && args?.[0] === 'expo' && args?.[1] === 'config') {
        return { stdout: JSON.stringify({ platforms: ['android'], name: 'MyApp' }) } as any;
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
    expect(mockedExeca).toHaveBeenCalledWith(
      './gradlew',
      ['assembleRelease'],
      expect.objectContaining({ cwd: expect.stringContaining('android') })
    );
  });

  it('reads expo config and builds ios on darwin', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin' });

    mockedExeca.mockImplementation((command: any, args: any) => {
      if (command === 'npx' && args?.[0] === 'expo' && args?.[1] === 'config') {
        return { stdout: JSON.stringify({ platforms: ['ios'], name: 'MyApp' }) } as any;
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
        return { stdout: JSON.stringify({ platforms: [], name: 'MyApp' }) } as any;
      }
      return Promise.resolve({}) as any;
    });

    await expect(main([])).rejects.toThrow('process.exit');
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('No supported platforms found')
    );
  });

  it('skips ios on non-darwin platforms', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux' });

    mockedExeca.mockImplementation((command: any, args: any) => {
      if (command === 'npx' && args?.[0] === 'expo' && args?.[1] === 'config') {
        return { stdout: JSON.stringify({ platforms: ['ios'], name: 'MyApp' }) } as any;
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
    // eslint-disable-next-line complexity
    mockedExeca.mockImplementation((command: any, args: any) => {
      if (command === 'npx' && args?.[0] === 'expo' && args?.[1] === 'config') {
        return { stdout: JSON.stringify({ platforms: ['android'], name: 'MyApp' }) } as any;
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
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('gradle failed'));
  });
});
