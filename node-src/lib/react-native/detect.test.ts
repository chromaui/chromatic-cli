import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  detectReactNativeProject,
  findStorybookConfigDirectory,
  getAppName,
  getIosScheme,
  getIosWorkspacePath,
  hasExpoRouter,
  isExpoProject,
  isReactNativeProject,
} from './detect';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn(),
  };
});

const fs = await import('fs');
const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockReaddirSync = vi.mocked(fs.readdirSync);

const projectRoot = '/tmp/test-project';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isReactNativeProject', () => {
  it('returns true when react-native is in dependencies', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ dependencies: { 'react-native': '0.72.0' } })
    );
    expect(isReactNativeProject(projectRoot)).toBe(true);
  });

  it('returns true when react-native is in devDependencies', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ devDependencies: { 'react-native': '0.72.0' } })
    );
    expect(isReactNativeProject(projectRoot)).toBe(true);
  });

  it('returns false when react-native is not present', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ dependencies: { react: '18.0.0' } }));
    expect(isReactNativeProject(projectRoot)).toBe(false);
  });

  it('returns false when package.json cannot be read', () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(isReactNativeProject(projectRoot)).toBe(false);
  });
});

describe('isExpoProject', () => {
  it('returns true when expo is in dependencies', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ dependencies: { expo: '~49.0.0' } }));
    expect(isExpoProject(projectRoot)).toBe(true);
  });

  it('returns false when expo is absent', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ dependencies: { 'react-native': '0.72.0' } })
    );
    expect(isExpoProject(projectRoot)).toBe(false);
  });
});

describe('hasExpoRouter', () => {
  it('returns true when expo-router is in dependencies', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ dependencies: { 'expo-router': '^3.0.0' } }));
    expect(hasExpoRouter(projectRoot)).toBe(true);
  });

  it('returns false when expo-router is absent', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ dependencies: { expo: '~49.0.0' } }));
    expect(hasExpoRouter(projectRoot)).toBe(false);
  });
});

describe('findStorybookConfigDirectory', () => {
  it('returns .storybook when it exists', () => {
    mockExistsSync.mockImplementation((p) => String(p).endsWith('.storybook'));
    expect(findStorybookConfigDirectory(projectRoot)).toBe('.storybook');
  });

  it('returns .rnstorybook as fallback', () => {
    mockExistsSync.mockImplementation((p) => String(p).endsWith('.rnstorybook'));
    expect(findStorybookConfigDirectory(projectRoot)).toBe('.rnstorybook');
  });

  it('prefers .storybook over .rnstorybook', () => {
    mockExistsSync.mockReturnValue(true);
    expect(findStorybookConfigDirectory(projectRoot)).toBe('.storybook');
  });

  it('returns undefined when neither exists', () => {
    mockExistsSync.mockReturnValue(false);
    expect(findStorybookConfigDirectory(projectRoot)).toBeUndefined();
  });
});

describe('getIosWorkspacePath', () => {
  it('returns workspace path when exactly one .xcworkspace exists', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['MyApp.xcworkspace', 'Podfile'] as any);
    expect(getIosWorkspacePath(projectRoot)).toBe('ios/MyApp.xcworkspace');
  });

  it('returns undefined when no ios directory exists', () => {
    mockExistsSync.mockReturnValue(false);
    expect(getIosWorkspacePath(projectRoot)).toBeUndefined();
  });

  it('returns undefined when multiple workspaces exist', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['A.xcworkspace', 'B.xcworkspace'] as any);
    expect(getIosWorkspacePath(projectRoot)).toBeUndefined();
  });

  it('returns undefined when no workspaces exist', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['Podfile', 'Pods'] as any);
    expect(getIosWorkspacePath(projectRoot)).toBeUndefined();
  });

  it('returns undefined when readdirSync throws', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockImplementation(() => {
      throw new Error('Permission denied');
    });
    expect(getIosWorkspacePath(projectRoot)).toBeUndefined();
  });
});

describe('getAppName', () => {
  it('returns expo name from app.json for Expo projects', () => {
    mockReadFileSync.mockImplementation((filePath) => {
      const p = String(filePath);
      if (p.endsWith('package.json')) {
        return JSON.stringify({ dependencies: { expo: '~49.0.0', 'react-native': '0.72.0' } });
      }
      if (p.endsWith('app.json')) {
        return JSON.stringify({ expo: { name: 'MyExpoApp', slug: 'my-expo-app' } });
      }
      throw new Error('ENOENT');
    });
    expect(getAppName(projectRoot)).toBe('MyExpoApp');
  });

  it('falls back to expo slug when name is missing', () => {
    mockReadFileSync.mockImplementation((filePath) => {
      const p = String(filePath);
      if (p.endsWith('package.json')) {
        return JSON.stringify({ dependencies: { expo: '~49.0.0' } });
      }
      if (p.endsWith('app.json')) {
        return JSON.stringify({ expo: { slug: 'my-expo-app' } });
      }
      throw new Error('ENOENT');
    });
    expect(getAppName(projectRoot)).toBe('my-expo-app');
  });

  it('returns iOS workspace-derived name for bare RN projects', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ dependencies: { 'react-native': '0.72.0' } })
    );
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['AwesomeApp.xcworkspace'] as any);
    expect(getAppName(projectRoot)).toBe('AwesomeApp');
  });

  it('returns undefined when no detection method works', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ dependencies: { 'react-native': '0.72.0' } })
    );
    mockExistsSync.mockReturnValue(false);
    expect(getAppName(projectRoot)).toBeUndefined();
  });
});

describe('getIosScheme', () => {
  it('returns the app name as scheme', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ dependencies: { 'react-native': '0.72.0' } })
    );
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['MyApp.xcworkspace'] as any);
    expect(getIosScheme(projectRoot)).toBe('MyApp');
  });

  it('returns undefined when app name is not determinable', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ dependencies: { 'react-native': '0.72.0' } })
    );
    mockExistsSync.mockReturnValue(false);
    expect(getIosScheme(projectRoot)).toBeUndefined();
  });
});

describe('detectReactNativeProject', () => {
  it('returns all-false result for non-RN projects', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ dependencies: { react: '18.0.0' } }));
    const result = detectReactNativeProject(projectRoot);
    expect(result).toEqual({
      isReactNative: false,
      isExpo: false,
      hasExpoRouter: false,
      storybookConfigDirectory: undefined,
      appName: undefined,
      iosWorkspacePath: undefined,
      iosScheme: undefined,
    });
  });

  it('detects a bare RN CLI project', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ dependencies: { 'react-native': '0.72.0' } })
    );
    mockExistsSync.mockImplementation((p) => {
      const s = String(p);
      // ios/ exists, .storybook exists
      return s.endsWith('/ios') || s.endsWith('.storybook');
    });
    mockReaddirSync.mockReturnValue(['BareApp.xcworkspace'] as any);

    const result = detectReactNativeProject(projectRoot);
    expect(result).toEqual({
      isReactNative: true,
      isExpo: false,
      hasExpoRouter: false,
      storybookConfigDirectory: '.storybook',
      appName: 'BareApp',
      iosWorkspacePath: 'ios/BareApp.xcworkspace',
      iosScheme: 'BareApp',
    });
  });

  it('detects an Expo project with expo-router', () => {
    mockReadFileSync.mockImplementation((filePath) => {
      const p = String(filePath);
      if (p.endsWith('package.json')) {
        return JSON.stringify({
          dependencies: { 'react-native': '0.72.0', expo: '~49.0.0', 'expo-router': '^3.0.0' },
        });
      }
      if (p.endsWith('app.json')) {
        return JSON.stringify({ expo: { name: 'ExpoApp', slug: 'expo-app' } });
      }
      throw new Error('ENOENT');
    });
    mockExistsSync.mockImplementation((p) => String(p).endsWith('.rnstorybook'));

    const result = detectReactNativeProject(projectRoot);
    expect(result).toEqual({
      isReactNative: true,
      isExpo: true,
      hasExpoRouter: true,
      storybookConfigDirectory: '.rnstorybook',
      appName: 'ExpoApp',
      iosWorkspacePath: undefined,
      iosScheme: 'ExpoApp',
    });
  });
});
