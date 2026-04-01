import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';

import { runCommand } from '../shell/shell';

export interface ReactNativeProjectInfo {
  isReactNative: boolean;
  isExpo: boolean;
  hasExpoRouter: boolean;
  storybookConfigDir: string | null;
  appName: string | null;
  ios: {
    available: boolean;
    workspacePath: string | null;
    workspaceCandidates: string[];
    schemeName: string | null;
    schemeCandidates: string[];
    appOutputPath: string;
    needsPrebuild: boolean;
  };
  android: {
    available: boolean;
    apkOutputPath: string;
  };
}

export async function detectReactNativeProject(
  projectRoot: string
): Promise<ReactNativeProjectInfo> {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

  const deps = packageJson.dependencies || {};
  const devDeps = packageJson.devDependencies || {};
  const allDeps = { ...deps, ...devDeps };

  const isReactNative = !!allDeps['react-native'];
  if (!isReactNative) {
    return {
      isReactNative: false,
      isExpo: false,
      hasExpoRouter: false,
      storybookConfigDir: null,
      appName: null,
      ios: {
        available: false,
        workspacePath: null,
        workspaceCandidates: [],
        schemeName: null,
        schemeCandidates: [],
        appOutputPath: '',
        needsPrebuild: false,
      },
      android: {
        available: false,
        apkOutputPath: '',
      },
    };
  }

  const isExpo = !!deps['expo'];
  const hasExpoRouter = !!allDeps['expo-router'];

  // Storybook config directory
  const storybookConfigDir = detectStorybookConfigDir(projectRoot);

  // App name
  const appName = detectAppName(projectRoot, isExpo);

  // iOS detection
  const ios = await detectIOS(projectRoot, isExpo, appName);

  // Android detection
  const android = detectAndroid(projectRoot);

  return {
    isReactNative,
    isExpo,
    hasExpoRouter,
    storybookConfigDir,
    appName,
    ios,
    android,
  };
}

function detectStorybookConfigDir(projectRoot: string): string | null {
  if (existsSync(path.join(projectRoot, '.storybook'))) {
    return '.storybook';
  }
  if (existsSync(path.join(projectRoot, '.rnstorybook'))) {
    return '.rnstorybook';
  }
  return null;
}

function detectAppName(projectRoot: string, isExpo: boolean): string | null {
  if (isExpo) {
    return detectExpoAppName(projectRoot);
  }
  return detectBareRNAppName(projectRoot);
}

function detectExpoAppName(projectRoot: string): string | null {
  const appJsonPath = path.join(projectRoot, 'app.json');
  if (existsSync(appJsonPath)) {
    try {
      const appJson = JSON.parse(readFileSync(appJsonPath, 'utf8'));
      return appJson.expo?.name || appJson.expo?.slug || appJson.name || null;
    } catch {
      return null;
    }
  }
  return null;
}

function detectBareRNAppName(projectRoot: string): string | null {
  const iosDir = path.join(projectRoot, 'ios');
  if (!existsSync(iosDir)) {
    return null;
  }
  const workspaces = findXcworkspaces(iosDir);
  if (workspaces.length === 1) {
    return path.basename(workspaces[0], '.xcworkspace');
  }
  return null;
}

function findXcworkspaces(iosDir: string): string[] {
  if (!existsSync(iosDir)) {
    return [];
  }
  try {
    return readdirSync(iosDir)
      .filter((f) => f.endsWith('.xcworkspace') && f !== 'Pods.xcworkspace')
      .map((f) => f);
  } catch {
    return [];
  }
}

async function detectIOS(
  projectRoot: string,
  isExpo: boolean,
  appName: string | null
): Promise<ReactNativeProjectInfo['ios']> {
  const iosDir = path.join(projectRoot, 'ios');
  const hasIosDir = existsSync(iosDir);
  const needsPrebuild = isExpo && !hasIosDir;

  // Check xcodebuild availability
  let available = false;
  try {
    await runCommand('xcodebuild -version', { timeout: 10_000 });
    available = true;
  } catch {
    available = false;
  }

  // Find workspaces
  const workspaces = hasIosDir ? findXcworkspaces(iosDir) : [];
  let workspacePath: string | null = null;
  const workspaceCandidates: string[] = [];

  if (workspaces.length === 1) {
    workspacePath = `ios/${workspaces[0]}`;
  } else if (workspaces.length > 1) {
    workspaceCandidates.push(...workspaces.map((w) => `ios/${w}`));
  } else if (isExpo && appName) {
    // Expected path after expo prebuild
    workspacePath = `ios/${appName}.xcworkspace`;
  }

  // Detect scheme
  let schemeName: string | null = null;
  const schemeCandidates: string[] = [];

  if (workspacePath && available) {
    const schemes = await detectSchemes(path.join(projectRoot, workspacePath));
    if (schemes.length === 1) {
      schemeName = schemes[0];
    } else if (schemes.length > 1) {
      schemeCandidates.push(...schemes);
    }
  }

  if (!schemeName && appName) {
    schemeName = appName;
  }

  const appOutputPath = `.chromatic/ios-build/Build/Products/Release-iphonesimulator/${schemeName || appName || 'App'}.app`;

  return {
    available,
    workspacePath,
    workspaceCandidates,
    schemeName,
    schemeCandidates,
    appOutputPath,
    needsPrebuild,
  };
}

async function detectSchemes(workspacePath: string): Promise<string[]> {
  try {
    const { stdout } = (await runCommand(`xcodebuild -workspace ${workspacePath} -list`, {
      timeout: 10_000,
    })) as any;

    const output = typeof stdout === 'string' ? stdout : String(stdout || '');
    const lines = output.split('\n');
    const schemesIndex = lines.findIndex((line: string) => line.trim().startsWith('Schemes:'));
    if (schemesIndex === -1) return [];

    const schemes: string[] = [];
    for (let i = schemesIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) break;
      if (!line.toLowerCase().includes('test')) {
        schemes.push(line);
      }
    }
    return schemes;
  } catch {
    return [];
  }
}

function detectAndroid(projectRoot: string): ReactNativeProjectInfo['android'] {
  const gradlewPath = path.join(projectRoot, 'android', 'gradlew');
  const available = existsSync(gradlewPath);

  return {
    available,
    apkOutputPath: 'android/app/build/outputs/apk/release/app-release.apk',
  };
}
