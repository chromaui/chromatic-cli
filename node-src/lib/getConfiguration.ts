import { existsSync, readFileSync } from 'fs';
import JSON5 from 'json5';
import { z, ZodError } from 'zod';

import { invalidConfigurationFile } from '../ui/messages/errors/invalidConfigurationFile';
import { missingConfigurationFile } from '../ui/messages/errors/missingConfigurationFile';
import { unparseableConfigurationFile } from '../ui/messages/errors/unparseableConfigurationFile';

const configurationSchema = z
  .object({
    $schema: z.string(),

    projectId: z.string(),
    projectToken: z.string(), // deprecated

    onlyChanged: z.union([z.string(), z.boolean()]),
    onlyStoryFiles: z.array(z.string()),
    onlyStoryNames: z.array(z.string()),
    traceChanged: z.union([z.string(), z.boolean()]),
    untraced: z.array(z.string()),
    externals: z.array(z.string()),
    debug: z.boolean(),
    diagnosticsFile: z.union([z.string(), z.boolean()]),
    fileHashing: z.boolean().default(true),
    junitReport: z.union([z.string(), z.boolean()]),
    zip: z.boolean(),
    autoAcceptChanges: z.union([z.string(), z.boolean()]),
    exitZeroOnChanges: z.union([z.string(), z.boolean()]),
    exitOnceUploaded: z.union([z.string(), z.boolean()]),
    ignoreLastBuildOnBranch: z.string(),

    buildScriptName: z.string(),
    buildCommand: z.string(),
    playwright: z.boolean(),
    cypress: z.boolean(),
    outputDir: z.string(),
    skip: z.union([z.string(), z.boolean()]),
    skipUpdateCheck: z.boolean(),

    storybookBuildDir: z.string(),
    storybookBaseDir: z.string(),
    storybookConfigDir: z.string(),
    storybookLogFile: z.union([z.string(), z.boolean()]),
    logFile: z.union([z.string(), z.boolean()]),
    uploadMetadata: z.boolean(),
  })
  .partial()
  .strict();

export type Configuration = z.infer<typeof configurationSchema>;

function resolveConfigFileName(configFile?: string): string {
  const usedConfigFile = [
    configFile,
    'chromatic.config.json',
    'chromatic.config.jsonc',
    'chromatic.config.json5',
  ].find((f?: string) => f && existsSync(f));

  return usedConfigFile || 'chromatic.config.json';
}
/**
 * Parse configuration details from a local config file (typically chromatic.config.json, but can
 * also use the JSON5 .jsonc and .json5 extensions. If more than one file is present, then the .json
 * one will take precedence.
 *
 * @param configFile The path to a custom config file (outside of the normal chromatic.config.json
 * file)
 *
 * @returns A parsed configration object from the local config file.
 */
export async function getConfiguration(
  configFile?: string
): Promise<Configuration & { configFile?: string }> {
  const usedConfigFile = resolveConfigFileName(configFile);
  try {
    const rawJson = readFileSync(usedConfigFile, 'utf8');
    const configuration = configurationSchema.parse(JSON5.parse(rawJson));
    return { configFile: usedConfigFile, ...configuration };
  } catch (err) {
    // Config file does not exist
    if (errIsNotExists(err)) {
      // The user passed no configFile option so it's OK for the file not to exist
      if (!configFile) {
        return {};
      }
      if (configFile) {
        throw new Error(missingConfigurationFile(configFile));
      }
    }
    if (err instanceof SyntaxError) {
      throw new TypeError(unparseableConfigurationFile(usedConfigFile, err));
    }
    if (err instanceof ZodError) {
      throw new TypeError(invalidConfigurationFile(usedConfigFile, err));
    }
    throw err;
  }
}

function errIsNotExists(err: Error) {
  // Node includes ENOENT in message
  // bun includes it in the  name
  // toString is the shortest check for both
  return err.toString().includes('ENOENT');
}
