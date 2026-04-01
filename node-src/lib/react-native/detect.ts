import { existsSync, readdirSync, readFileSync } from 'fs';
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
  storybookConfigDirectory: string | undefined;
  /** The application name (from Expo config or iOS workspace). */
  appName: string | undefined;
  /** Path to the iOS .xcworkspace file relative to project root. */
  iosWorkspacePath: string | undefined;
  /** The iOS build scheme name. */
  iosScheme: string | undefined;
}

/**
 * Checks whether the project at the given root is a React Native project.
 *
 * @param projectRoot - Absolute path to the project root directory.
 *
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
 *
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
 *
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
 *
 * @returns The relative config directory name, or undefined if neither exists.
 */
export function findStorybookConfigDirectory(projectRoot: string): string | undefined {
  const candidates = ['.storybook', '.rnstorybook'];
  for (const candidate of candidates) {
    if (existsSync(path.join(projectRoot, candidate))) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Discovers the app name from Expo config (app.json) or iOS workspace.
 *
 * @param projectRoot - Absolute path to the project root directory.
 *
 * @returns The discovered app name, or undefined if detection fails.
 */
export function getAppName(projectRoot: string): string | undefined {
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

  return undefined;
}

/**
 * Finds the iOS .xcworkspace path by reading the ios/ directory.
 *
 * @param projectRoot - Absolute path to the project root directory.
 *
 * @returns The relative workspace path, or undefined if none or multiple found.
 */
export function getIosWorkspacePath(projectRoot: string): string | undefined {
  const iosDirectory = path.join(projectRoot, 'ios');
  if (!existsSync(iosDirectory)) return undefined;

  try {
    const entries = readdirSync(iosDirectory);
    const workspaces = entries.filter((entry) => entry.endsWith('.xcworkspace'));

    if (workspaces.length === 1) {
      return path.join('ios', workspaces[0]);
    }
  } catch {
    // ios/ directory may not be readable
  }

  return undefined;
}

/**
 * Discovers the iOS scheme name from the workspace. Falls back to the app name.
 *
 * @param projectRoot - Absolute path to the project root directory.
 *
 * @returns The scheme name, or undefined if it cannot be determined.
 */
export function getIosScheme(projectRoot: string): string | undefined {
  // The scheme name typically matches the app name in React Native projects
  return getAppName(projectRoot);
}

/**
 * Main detection function that combines all checks into a single result object.
 *
 * @param projectRoot - Absolute path to the project root directory.
 *
 * @returns A ReactNativeProjectInfo object with all detected values.
 */
export function detectReactNativeProject(projectRoot: string): ReactNativeProjectInfo {
  const isReactNative = isReactNativeProject(projectRoot);

  if (!isReactNative) {
    return {
      isReactNative: false,
      isExpo: false,
      hasExpoRouter: false,
      storybookConfigDirectory: undefined,
      appName: undefined,
      iosWorkspacePath: undefined,
      iosScheme: undefined,
    };
  }

  const isExpo = isExpoProject(projectRoot);

  return {
    isReactNative,
    isExpo,
    hasExpoRouter: hasExpoRouter(projectRoot),
    storybookConfigDirectory: findStorybookConfigDirectory(projectRoot),
    appName: getAppName(projectRoot),
    iosWorkspacePath: getIosWorkspacePath(projectRoot),
    iosScheme: getIosScheme(projectRoot),
  };
}

function readPackageJson(projectRoot: string): Record<string, any> | undefined {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  try {
    const content = readFileSync(packageJsonPath, 'utf8');
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

function hasDependency(packageJson: Record<string, any>, name: string): boolean {
  return !!(packageJson.dependencies?.[name] || packageJson.devDependencies?.[name]);
}

function getExpoAppName(projectRoot: string): string | undefined {
  const appJsonPath = path.join(projectRoot, 'app.json');
  try {
    const content = readFileSync(appJsonPath, 'utf8');
    const appConfig = JSON.parse(content);
    return appConfig.expo?.name || appConfig.expo?.slug || appConfig.name || undefined;
  } catch {
    return undefined;
  }
}
