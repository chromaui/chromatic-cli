import { execa } from 'execa';

export interface ExpoConfig {
  platforms?: string[];
  scheme?: string;
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
