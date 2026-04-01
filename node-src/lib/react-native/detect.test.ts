import { existsSync, readdirSync, readFileSync } from 'fs';
import { describe, expect, it, vi } from 'vitest';

import { runCommand } from '../shell/shell';
import { detectReactNativeProject } from './detect';

vi.mock('fs');
vi.mock('../shell/shell', () => ({
  runCommand: vi.fn(),
}));

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedReaddirSync = vi.mocked(readdirSync);
const mockedRunCommand = vi.mocked(runCommand);

function mockPackageJson(
  deps: Record<string, string> = {},
  developmentDeps: Record<string, string> = {}
) {
  mockedReadFileSync.mockReturnValue(
    JSON.stringify({ dependencies: deps, devDependencies: developmentDeps })
  );
}

describe('detectReactNativeProject', () => {
  it('returns isReactNative: false when react-native is not in deps', async () => {
    mockPackageJson({ react: '18.0.0' });
    const result = await detectReactNativeProject('/project');
    expect(result.isReactNative).toBe(false);
  });

  it('detects Expo project', async () => {
    mockPackageJson({ 'react-native': '0.73.0', expo: '50.0.0' });
    mockedExistsSync.mockReturnValue(false);

    const result = await detectReactNativeProject('/project');
    expect(result.isReactNative).toBe(true);
    expect(result.isExpo).toBe(true);
  });

  it('detects bare RN project without expo', async () => {
    mockPackageJson({ 'react-native': '0.73.0' });
    mockedExistsSync.mockReturnValue(false);

    const result = await detectReactNativeProject('/project');
    expect(result.isReactNative).toBe(true);
    expect(result.isExpo).toBe(false);
  });

  it('detects expo-router', async () => {
    mockPackageJson({ 'react-native': '0.73.0', expo: '50.0.0', 'expo-router': '3.0.0' });
    mockedExistsSync.mockReturnValue(false);

    const result = await detectReactNativeProject('/project');
    expect(result.hasExpoRouter).toBe(true);
  });

  it('finds .storybook config directory', async () => {
    mockPackageJson({ 'react-native': '0.73.0' });
    mockedExistsSync.mockImplementation((p: any) => {
      if (String(p).endsWith('.storybook')) return true;
      return false;
    });

    const result = await detectReactNativeProject('/project');
    expect(result.storybookConfigDir).toBe('.storybook');
  });

  it('falls back to .rnstorybook config directory', async () => {
    mockPackageJson({ 'react-native': '0.73.0' });
    mockedExistsSync.mockImplementation((p: any) => {
      if (String(p).endsWith('.rnstorybook')) return true;
      return false;
    });

    const result = await detectReactNativeProject('/project');
    expect(result.storybookConfigDir).toBe('.rnstorybook');
  });

  it('returns null storybookConfigDir when neither exists', async () => {
    mockPackageJson({ 'react-native': '0.73.0' });
    mockedExistsSync.mockReturnValue(false);

    const result = await detectReactNativeProject('/project');
    expect(result.storybookConfigDir).toBeNull();
  });

  it('detects app name from Expo app.json', async () => {
    mockPackageJson({ 'react-native': '0.73.0', expo: '50.0.0' });
    mockedExistsSync.mockImplementation((p: any) => {
      if (String(p).endsWith('app.json')) return true;
      return false;
    });
    mockedReadFileSync.mockImplementation((p: any) => {
      if (String(p).endsWith('app.json')) {
        return JSON.stringify({ expo: { name: 'MyExpoApp', slug: 'my-expo-app' } });
      }
      return JSON.stringify({
        dependencies: { 'react-native': '0.73.0', expo: '50.0.0' },
      });
    });

    const result = await detectReactNativeProject('/project');
    expect(result.appName).toBe('MyExpoApp');
  });

  it('detects app name from bare RN workspace', async () => {
    mockPackageJson({ 'react-native': '0.73.0' });
    mockedExistsSync.mockImplementation((p: any) => {
      if (String(p).endsWith('ios')) return true;
      return false;
    });
    mockedReaddirSync.mockReturnValue(['MyApp.xcworkspace'] as any);

    const result = await detectReactNativeProject('/project');
    expect(result.appName).toBe('MyApp');
  });

  it('sets needsPrebuild for Expo without ios directory', async () => {
    mockPackageJson({ 'react-native': '0.73.0', expo: '50.0.0' });
    mockedExistsSync.mockReturnValue(false);
    mockedRunCommand.mockRejectedValue(new Error('not found'));

    const result = await detectReactNativeProject('/project');
    expect(result.ios.needsPrebuild).toBe(true);
  });

  it('detects android availability from gradlew', async () => {
    mockPackageJson({ 'react-native': '0.73.0' });
    mockedExistsSync.mockImplementation((p: any) => {
      if (String(p).includes('android/gradlew')) return true;
      return false;
    });

    const result = await detectReactNativeProject('/project');
    expect(result.android.available).toBe(true);
    expect(result.android.apkOutputPath).toBe(
      'android/app/build/outputs/apk/release/app-release.apk'
    );
  });

  it('sets ios.available to false when xcodebuild is not available', async () => {
    mockPackageJson({ 'react-native': '0.73.0' });
    mockedExistsSync.mockReturnValue(false);
    mockedRunCommand.mockRejectedValue(new Error('xcodebuild not found'));

    const result = await detectReactNativeProject('/project');
    expect(result.ios.available).toBe(false);
  });

  it('populates workspaceCandidates when multiple workspaces found', async () => {
    mockPackageJson({ 'react-native': '0.73.0' });
    mockedExistsSync.mockImplementation((p: any) => {
      if (String(p).endsWith('ios')) return true;
      return false;
    });
    mockedReaddirSync.mockReturnValue(['App1.xcworkspace', 'App2.xcworkspace'] as any);
    mockedRunCommand.mockRejectedValue(new Error('not found'));

    const result = await detectReactNativeProject('/project');
    expect(result.ios.workspacePath).toBeNull();
    expect(result.ios.workspaceCandidates).toEqual([
      'ios/App1.xcworkspace',
      'ios/App2.xcworkspace',
    ]);
  });

  it('sets single workspacePath when one workspace found', async () => {
    mockPackageJson({ 'react-native': '0.73.0' });
    mockedExistsSync.mockImplementation((p: any) => {
      if (String(p).endsWith('ios')) return true;
      return false;
    });
    mockedReaddirSync.mockReturnValue(['MyApp.xcworkspace'] as any);
    mockedRunCommand.mockRejectedValue(new Error('not found'));

    const result = await detectReactNativeProject('/project');
    expect(result.ios.workspacePath).toBe('ios/MyApp.xcworkspace');
  });
});
