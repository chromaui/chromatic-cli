import { existsSync, readFileSync, writeFileSync } from 'fs';
import { writeFile } from 'jsonfile';
import prompts from 'prompts';
import { describe, expect, it, vi } from 'vitest';

import { detectReactNativeProject } from './detect';
import { setupReactNative } from './setup';

vi.mock('fs');
vi.mock('jsonfile', () => ({
  writeFile: vi.fn(() => Promise.resolve()),
}));
vi.mock('prompts');
vi.mock('../getConfiguration', () => ({
  getConfiguration: vi.fn(() => Promise.resolve({ projectId: 'test-id' })),
}));
vi.mock('./detect', () => ({
  detectReactNativeProject: vi.fn(),
}));

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedWriteFile = vi.mocked(writeFile);
const mockedPrompts = vi.mocked(prompts);
const mockedDetectReactNativeProject = vi.mocked(detectReactNativeProject);

function makeProjectInfo(overrides: Record<string, any> = {}) {
  return {
    isReactNative: true,
    isExpo: false,
    hasExpoRouter: false,
    storybookConfigDir: '.storybook',
    appName: 'MyApp',
    ios: {
      available: true,
      workspacePath: 'ios/MyApp.xcworkspace',
      workspaceCandidates: [],
      schemeName: 'MyApp',
      schemeCandidates: [],
      appOutputPath: '.chromatic/ios-build/Build/Products/Release-iphonesimulator/MyApp.app',
      needsPrebuild: false,
    },
    android: {
      available: true,
      apkOutputPath: 'android/app/build/outputs/apk/release/app-release.apk',
    },
    ...overrides,
  };
}

describe('setupReactNative', () => {
  it('configures both Android and iOS for a bare RN project', async () => {
    mockedDetectReactNativeProject.mockResolvedValue(makeProjectInfo());
    mockedPrompts.mockResolvedValueOnce({ platforms: ['android', 'ios'] });
    mockedExistsSync.mockReturnValue(false);

    const result = await setupReactNative('/project', { scripts: {} }, '/project/package.json');

    expect(result.platforms).toEqual(['android', 'ios']);
    expect(result.android?.buildCommand).toContain('gradlew assembleRelease');
    expect(result.ios?.workspace).toBe('ios/MyApp.xcworkspace');
    expect(result.ios?.scheme).toBe('MyApp');

    // Verify config was written
    expect(mockedWriteFile).toHaveBeenCalledWith(
      'chromatic.config.json',
      expect.objectContaining({
        reactNative: expect.objectContaining({
          platforms: ['android', 'ios'],
        }),
      }),
      { spaces: 2 }
    );

    // Verify package.json was updated
    expect(mockedWriteFile).toHaveBeenCalledWith(
      '/project/package.json',
      expect.objectContaining({
        scripts: expect.objectContaining({
          'chromatic:build:android': expect.stringContaining('gradlew'),
          'chromatic:build:ios': expect.stringContaining('xcodebuild'),
        }),
      }),
      { spaces: 2 }
    );
  });

  it('configures Android only', async () => {
    mockedDetectReactNativeProject.mockResolvedValue(makeProjectInfo());
    mockedPrompts.mockResolvedValueOnce({ platforms: ['android'] });
    mockedExistsSync.mockReturnValue(false);

    const result = await setupReactNative('/project', { scripts: {} }, '/project/package.json');

    expect(result.platforms).toEqual(['android']);
    expect(result.android).toBeDefined();
    expect(result.ios).toBeUndefined();
  });

  it('prompts when multiple workspaces found', async () => {
    mockedDetectReactNativeProject.mockResolvedValue(
      makeProjectInfo({
        ios: {
          available: true,
          workspacePath: null,
          workspaceCandidates: ['ios/App1.xcworkspace', 'ios/App2.xcworkspace'],
          schemeName: 'MyApp',
          schemeCandidates: [],
          appOutputPath: '.chromatic/ios-build/Build/Products/Release-iphonesimulator/MyApp.app',
          needsPrebuild: false,
        },
      })
    );
    mockedPrompts
      .mockResolvedValueOnce({ platforms: ['ios'] })
      .mockResolvedValueOnce({ selectedWorkspace: 'ios/App1.xcworkspace' });
    mockedExistsSync.mockReturnValue(false);

    const result = await setupReactNative('/project', { scripts: {} }, '/project/package.json');

    expect(result.ios?.workspace).toBe('ios/App1.xcworkspace');
  });

  it('prompts when multiple schemes found', async () => {
    mockedDetectReactNativeProject.mockResolvedValue(
      makeProjectInfo({
        ios: {
          available: true,
          workspacePath: 'ios/MyApp.xcworkspace',
          workspaceCandidates: [],
          schemeName: null,
          schemeCandidates: ['MyApp', 'MyAppDev'],
          appOutputPath: '.chromatic/ios-build/Build/Products/Release-iphonesimulator/MyApp.app',
          needsPrebuild: false,
        },
      })
    );
    mockedPrompts
      .mockResolvedValueOnce({ platforms: ['ios'] })
      .mockResolvedValueOnce({ selectedScheme: 'MyAppDev' });
    mockedExistsSync.mockReturnValue(false);

    const result = await setupReactNative('/project', { scripts: {} }, '/project/package.json');

    expect(result.ios?.scheme).toBe('MyAppDev');
  });

  it('updates .gitignore with .chromatic/', async () => {
    mockedDetectReactNativeProject.mockResolvedValue(makeProjectInfo());
    mockedPrompts.mockResolvedValueOnce({ platforms: ['android'] });
    mockedExistsSync.mockImplementation((p: any) => {
      if (String(p).endsWith('.gitignore')) return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue('node_modules/\n');

    await setupReactNative('/project', { scripts: {} }, '/project/package.json');

    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.gitignore'),
      expect.stringContaining('.chromatic/')
    );
  });

  it('does not duplicate .chromatic/ in .gitignore', async () => {
    mockedDetectReactNativeProject.mockResolvedValue(makeProjectInfo());
    mockedPrompts.mockResolvedValueOnce({ platforms: ['android'] });
    mockedExistsSync.mockImplementation((p: any) => {
      if (String(p).endsWith('.gitignore')) return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue('node_modules/\n.chromatic/\n');

    await setupReactNative('/project', { scripts: {} }, '/project/package.json');

    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });

  it('throws when project is not React Native', async () => {
    mockedDetectReactNativeProject.mockResolvedValue({ isReactNative: false });

    await expect(
      setupReactNative('/project', { scripts: {} }, '/project/package.json')
    ).rejects.toThrow('not appear to be a React Native project');
  });

  it('throws when no storybook config dir found', async () => {
    mockedDetectReactNativeProject.mockResolvedValue(makeProjectInfo({ storybookConfigDir: null }));

    await expect(
      setupReactNative('/project', { scripts: {} }, '/project/package.json')
    ).rejects.toThrow('No Storybook config directory found');
  });
});
