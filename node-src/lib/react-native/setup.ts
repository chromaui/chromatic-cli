import { existsSync, readFileSync, writeFileSync } from 'fs';
import { writeFile } from 'jsonfile';
import path from 'path';
import prompts from 'prompts';

import { getConfiguration } from '../getConfiguration';
import { detectReactNativeProject, type ReactNativeProjectInfo } from './detect';

export interface ReactNativeSetupResult {
  platforms: ('android' | 'ios')[];
  android?: {
    buildCommand: string;
    apkPath: string;
  };
  ios?: {
    workspace: string;
    scheme: string;
    buildCommand: string;
    appPath: string;
  };
}

export async function setupReactNative(
  projectRoot: string,
  packageJson: any,
  packagePath: string
): Promise<ReactNativeSetupResult> {
  const info = await detectReactNativeProject(projectRoot);

  if (!info.isReactNative) {
    throw new Error('This does not appear to be a React Native project.');
  }

  if (!info.storybookConfigDir) {
    throw new Error(
      'No Storybook config directory found. Please set up Storybook first (.storybook/ or .rnstorybook/).'
    );
  }

  // Prompt for platforms
  const { platforms } = await prompts({
    type: 'multiselect',
    name: 'platforms',
    message: 'Which platforms do you want to test with Chromatic?',
    choices: [
      { title: 'Android', value: 'android', selected: true },
      { title: 'iOS', value: 'ios', selected: true },
    ],
    min: 1,
  });

  if (!platforms || platforms.length === 0) {
    throw new Error('At least one platform must be selected.');
  }

  const result: ReactNativeSetupResult = { platforms };

  // Android setup
  if (platforms.includes('android')) {
    result.android = setupAndroid(info);
  }

  // iOS setup
  if (platforms.includes('ios')) {
    result.ios = await setupIOS(info);
  }

  // Write chromatic.config.json
  await writeConfig(result);

  // Update package.json scripts
  await updatePackageJsonScripts(result, packageJson, packagePath);

  // Update .gitignore
  updateGitignore(projectRoot);

  // Print summary
  printSummary(result);

  return result;
}

function setupAndroid(info: ReactNativeProjectInfo) {
  if (!info.android.available && !info.isExpo) {
    console.log(
      'Warning: android/gradlew not found. Make sure Android SDK is set up before building.'
    );
  }

  if (!info.android.available && info.isExpo) {
    console.log(
      'Note: android/ directory not found. Run `npx expo prebuild --platform android` before building.'
    );
  }

  const buildCommand = 'cd android && STORYBOOK_ENABLED=true ./gradlew assembleRelease';
  const apkPath = info.android.apkOutputPath;

  return { buildCommand, apkPath };
}

async function setupIOS(info: ReactNativeProjectInfo) {
  if (!info.ios.available) {
    console.log(
      'Warning: Xcode not found. iOS builds require macOS with Xcode installed. You can still configure iOS and build on a Mac later.'
    );
  }

  if (info.ios.needsPrebuild) {
    console.log(
      "Note: Your Expo project doesn't have an ios/ directory yet. We'll run `npx expo prebuild --platform ios` during the build step."
    );
  }

  // Resolve workspace
  let workspace = info.ios.workspacePath;

  if (!workspace && info.ios.workspaceCandidates.length > 1) {
    const { selectedWorkspace } = await prompts({
      type: 'select',
      name: 'selectedWorkspace',
      message: 'We found multiple Xcode workspaces. Which one is your app?',
      choices: info.ios.workspaceCandidates.map((w) => ({ title: w, value: w })),
    });
    workspace = selectedWorkspace;
  }

  if (!workspace && info.ios.workspaceCandidates.length === 0) {
    if (info.isExpo && info.appName) {
      workspace = `ios/${info.appName}.xcworkspace`;
    } else if (!info.isExpo) {
      throw new Error("No .xcworkspace found in ios/. Make sure you've run `pod install`.");
    }
  }

  // Resolve scheme
  let scheme = info.ios.schemeName;

  if (!scheme && info.ios.schemeCandidates.length > 1) {
    const { selectedScheme } = await prompts({
      type: 'select',
      name: 'selectedScheme',
      message: 'We found multiple Xcode schemes. Which one builds your app?',
      choices: info.ios.schemeCandidates.map((s) => ({ title: s, value: s })),
    });
    scheme = selectedScheme;
  }

  if (!scheme && info.appName) {
    scheme = info.appName;
  }

  if (!scheme) {
    scheme = 'App';
  }

  const buildCommand = [
    'xcodebuild',
    `-workspace ${workspace}`,
    `-scheme ${scheme}`,
    '-configuration Release',
    '-sdk iphonesimulator',
    '-derivedDataPath .chromatic/ios-build',
    '-arch arm64 -arch x86_64',
    'CODE_SIGNING_ALLOWED=NO',
  ].join(' ');

  const appPath = `.chromatic/ios-build/Build/Products/Release-iphonesimulator/${scheme}.app`;

  return { workspace: workspace || '', scheme, buildCommand, appPath };
}

async function writeConfig(result: ReactNativeSetupResult) {
  const existing = await getConfiguration().catch(() => ({}));

  const config = {
    ...existing,
    reactNative: {
      platforms: result.platforms,
      ...(result.android && {
        android: {
          buildCommand: result.android.buildCommand,
          apkPath: result.android.apkPath,
        },
      }),
      ...(result.ios && {
        ios: {
          workspace: result.ios.workspace,
          scheme: result.ios.scheme,
          appPath: result.ios.appPath,
        },
      }),
    },
  };

  // Remove internal configFile key before writing
  const { configFile, ...configToWrite } = config as any;
  await writeFile('chromatic.config.json', configToWrite, { spaces: 2 });
}

async function updatePackageJsonScripts(
  result: ReactNativeSetupResult,
  packageJson: any,
  packagePath: string
) {
  const scripts: Record<string, string> = { ...packageJson.scripts };

  if (result.android) {
    scripts['chromatic:build:android'] = result.android.buildCommand;
  }
  if (result.ios) {
    scripts['chromatic:build:ios'] = result.ios.buildCommand;
  }

  const updatedPackageJson = { ...packageJson, scripts };
  await writeFile(packagePath, updatedPackageJson, { spaces: 2 });
}

function updateGitignore(projectRoot: string) {
  const gitignorePath = path.join(projectRoot, '.gitignore');
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf8');
    if (!content.includes('.chromatic/')) {
      writeFileSync(
        gitignorePath,
        `${content.trimEnd()}\n\n# Chromatic build artifacts\n.chromatic/\n`
      );
    }
  } else {
    writeFileSync(gitignorePath, '# Chromatic build artifacts\n.chromatic/\n');
  }
}

function printSummary(result: ReactNativeSetupResult) {
  console.log('\n✔ Chromatic React Native setup complete\n');
  console.log('Configuration written to chromatic.config.json');
  console.log('Build scripts added to package.json\n');
  console.log('Platforms configured:');

  if (result.android) {
    console.log(`  ✔ Android — build command: ${result.android.buildCommand}`);
  }
  if (result.ios) {
    console.log(`  ✔ iOS — workspace: ${result.ios.workspace}, scheme: ${result.ios.scheme}`);
  }

  console.log('\nNext steps:');
  console.log(
    '  1. Make sure Storybook is configured with entry-point swapping (withStorybook in metro.config.js)'
  );
  console.log('  2. Run: npx chromatic');
}
