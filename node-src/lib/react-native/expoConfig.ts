import { execa } from 'execa';
import slugify from 'slugify';

export interface ExpoConfig {
  name: string;
  platforms?: string[];
}

/**
 * Sanitize a project name for use as an iOS xcodebuild scheme and workspace name.
 * Replicates the behavior of `@expo/config-plugins` sanitizedName from
 * `@expo/config-plugins/build/ios/utils/Xcodeproj.js`.
 *
 * @param name The raw project name from the Expo config.
 *
 * @returns The sanitized name safe for use as an xcodebuild scheme.
 */
export function sanitizedName(name: string): string {
  return sanitizedNameForProjects(name) || sanitizedNameForProjects(slugify(name)) || 'app';
}

function sanitizedNameForProjects(name: string): string {
  return name
    .replaceAll(/[\W_]+/g, '')
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036F]/g, '');
}

/**
 * Read the Expo config by running `npx expo config --json`.
 *
 * @returns Partial expo config.
 */
export async function readExpoConfig(): Promise<ExpoConfig> {
  try {
    const result = await execa('npx', ['expo', 'config', '--json']);
    return JSON.parse(result.stdout) as ExpoConfig;
  } catch {
    throw new Error(
      'Failed to read Expo config. Ensure Expo is installed and you are in an Expo project directory.'
    );
  }
}
