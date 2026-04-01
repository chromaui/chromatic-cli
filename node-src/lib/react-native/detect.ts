import { existsSync, readFileSync, readdirSync } from 'fs';
import path from 'path';

/**
 * Result of detecting a React Native project's configuration.
 */
export interface ReactNativeProjectInfo {
  /** Whether this is a React Native project. */
  isReactNative: boolean;
  /** Whether the project uses Expo. */
  isExpo: boolean;
  /** Whether expo-router is installed. */
  hasExpoRouter: boolean;
  /** Path to the Storybook config directory relative to project root. */
  storybookConfigDir: string | null;
  /** The application name (from Expo config or iOS workspace). */
  appName: string | null;
  /** Path to the iOS .xcworkspace file relative to project root. */
  iosWorkspacePath: string | null;
  /** The iOS build scheme name. */
  iosScheme: string | null;
}

/**
 * Checks whether the project at the given root is a React Native project.
 *
 * @param projectRoot - Absolute path to the project root directory.
 * @returns True if react-native is in dependencies or devDependencies.
 */
export function isReactNativeProject(projectRoot: string): boolean {
  const packageJson = readPackageJson(projectRoot);
  if (!packageJson) return false;
  return hasDependency(packageJson, 'react-native');
}

/**
 * Checks whether the project uses Expo.
 *
 * @param projectRoot - Absolute path to the project root directory.
 * @returns True if expo is in dependencies or devDependencies.
 */
export function isExpoProject(projectRoot: string): boolean {
  const packageJson = readPackageJson(projectRoot);
  if (!packageJson) return false;
  return hasDependency(packageJson, 'expo');
}

/**
 * Checks whether expo-router is installed.
 *
 * @param projectRoot - Absolute path to the project root directory.
 * @returns True if expo-router is in dependencies or devDependencies.
 */
export function hasExpoRouter(projectRoot: string): boolean {
  const packageJson = readPackageJson(projectRoot);
  if (!packageJson) return false;
  return hasDependency(packageJson, 'expo-router');
}

/**
 * Finds the Storybook config directory, checking .storybook/ first then .rnstorybook/.
 *
 * @param projectRoot - Absolute path to the project root directory.
 * @returns The relative config directory name, or null if neither exists.
 */
export function findStorybookConfigDir(projectRoot: string): string | null {
  const candidates = ['.storybook', '.rnstorybook'];
  for (const candidate of candidates) {
    if (existsSync(path.join(projectRoot, candidate))) {
      return candidate;
    }
  }
  return null;
}

/**
 * Discovers the app name from Expo config (app.json) or iOS workspace.
 *
 * @param projectRoot - Absolute path to the project root directory.
 * @returns The discovered app name, or null if detection fails.
 */
export function getAppName(projectRoot: string): string | null {
  const packageJson = readPackageJson(projectRoot);
  const isExpo = packageJson ? hasDependency(packageJson, 'expo') : false;

  if (isExpo) {
    return getExpoAppName(projectRoot);
  }

  // For bare RN CLI, derive name from iOS workspace
  const workspace = getIosWorkspacePath(projectRoot);
  if (workspace) {
    return path.basename(workspace, '.xcworkspace');
  }

  return null;
}

/**
 * Finds the iOS .xcworkspace path by globbing ios/*.xcworkspace.
 *
 * @param projectRoot - Absolute path to the project root directory.
 * @returns The relative workspace path, a list if multiple found, or null if none.
 */
export function getIosWorkspacePath(projectRoot: string): string | null {
  const iosDirectory = path.join(projectRoot, 'ios');
  if (!existsSync(iosDirectory)) return null;

  try {
    const entries = readdirSync(iosDirectory);
    const workspaces = entries.filter((entry) => entry.endsWith('.xcworkspace'));

    if (workspaces.length === 1) {
      return path.join('ios', workspaces[0]);
    }
  } catch {
    // ios/ directory may not be readable
  }

  return null;
}

/**
 * Discovers the iOS scheme name from the workspace. Falls back to the app name.
 *
 * @param projectRoot - Absolute path to the project root directory.
 * @returns The scheme name, or null if it cannot be determined.
 */
export function getIosScheme(projectRoot: string): string | null {
  // The scheme name typically matches the app name in React Native projects
  const appName = getAppName(projectRoot);
  return appName ?? null;
}

/**
 * Main detection function that combines all checks into a single result object.
 *
 * @param projectRoot - Absolute path to the project root directory.
 * @returns A ReactNativeProjectInfo object with all detected values.
 */
export function detectReactNativeProject(projectRoot: string): ReactNativeProjectInfo {
  const isReactNative = isReactNativeProject(projectRoot);

  if (!isReactNative) {
    return {
      isReactNative: false,
      isExpo: false,
      hasExpoRouter: false,
      storybookConfigDir: null,
      appName: null,
      iosWorkspacePath: null,
      iosScheme: null,
    };
  }

  const isExpo = isExpoProject(projectRoot);
  const expoRouter = hasExpoRouter(projectRoot);
  const storybookConfigDir = findStorybookConfigDir(projectRoot);
  const appName = getAppName(projectRoot);
  const iosWorkspacePath = getIosWorkspacePath(projectRoot);
  const iosScheme = getIosScheme(projectRoot);

  return {
    isReactNative,
    isExpo,
    hasExpoRouter: expoRouter,
    storybookConfigDir,
    appName,
    iosWorkspacePath,
    iosScheme,
  };
}

function readPackageJson(projectRoot: string): Record<string, any> | null {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  try {
    const content = readFileSync(packageJsonPath, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function hasDependency(packageJson: Record<string, any>, name: string): boolean {
  return !!(packageJson.dependencies?.[name] || packageJson.devDependencies?.[name]);
}

function getExpoAppName(projectRoot: string): string | null {
  const appJsonPath = path.join(projectRoot, 'app.json');
  try {
    const content = readFileSync(appJsonPath, 'utf8');
    const appConfig = JSON.parse(content);
    return appConfig.expo?.name || appConfig.expo?.slug || appConfig.name || null;
  } catch {
    return null;
  }
}
