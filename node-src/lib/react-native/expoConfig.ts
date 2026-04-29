import { IOSConfig } from '@expo/config-plugins';
import { ExpoConfig } from '@expo/config-types';
import { execa } from 'execa';

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

// Re-export the sanitizedName function from expo/config-plugins to ensure iOS filename consistency.
export const sanitizedName = IOSConfig.XcodeUtils.sanitizedName;

export { ExpoConfig } from '@expo/config-types';
