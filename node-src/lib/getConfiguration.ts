import { readFileSync } from 'fs';
import { ZodError, z } from 'zod';
import { missingConfigurationFile } from '../ui/messages/errors/missingConfigurationFile';
import { unparseableConfigurationFile } from '../ui/messages/errors/unparseableConfigurationFile';
import { invalidConfigurationFile } from '../ui/messages/errors/invalidConfigurationFile';

const configurationSchema = z
  .object({
    projectId: z.string(),
    projectToken: z.string(), // deprecated

    onlyChanged: z.union([z.string(), z.boolean()]),
    onlyStoryFiles: z.array(z.string()),
    onlyStoryNames: z.array(z.string()),
    untraced: z.array(z.string()),
    externals: z.array(z.string()),
    debug: z.boolean(),
    diagnosticFile: z.union([z.string(), z.boolean()]),
    fileHashing: z.boolean().default(true),
    junitReport: z.union([z.string(), z.boolean()]),
    zip: z.boolean(),
    autoAcceptChanges: z.union([z.string(), z.boolean()]),
    exitZeroOnChanges: z.union([z.string(), z.boolean()]),
    exitOnceUploaded: z.union([z.string(), z.boolean()]),
    ignoreLastBuildOnBranch: z.string(),
    skip: z.union([z.string(), z.boolean()]),

    buildScriptName: z.string(),
    outputDir: z.string(),
    skip: z.union([z.string(), z.boolean()]),

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

export async function getConfiguration(configFile?: string) {
  const usedConfigFile = configFile || 'chromatic.config.json';
  try {
    const rawJson = readFileSync(usedConfigFile, 'utf8');

    return configurationSchema.parse(JSON.parse(rawJson));
  } catch (err) {
    // Config file does not exist
    if (err.message.match(/ENOENT/)) {
      // The user passed no configFile option so it's OK for the file not to exist
      if (!configFile) {
        return {};
      }
      if (configFile) {
        throw new Error(missingConfigurationFile(configFile));
      }
    }
    if (err.message.match('Unexpected string')) {
      throw new Error(unparseableConfigurationFile(usedConfigFile, err));
    }
    if (err instanceof ZodError) {
      throw new Error(invalidConfigurationFile(usedConfigFile, err));
    }
    throw err;
  }
}
