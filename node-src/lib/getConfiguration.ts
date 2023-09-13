import { readFile } from 'jsonfile';
import { ZodError, z } from 'zod';
import { missingConfigurationFile } from '../ui/messages/errors/missingConfigurationFile';
import { unparseableConfigurationFile } from '../ui/messages/errors/unparseableConfigurationFile';
import { invalidConfigurationFile } from '../ui/messages/errors/invalidConfigurationFile';

const configurationSchema = z
  .object({
    projectId: z.string(),
    projectToken: z.string(),

    onlyChanged: z.union([z.string(), z.boolean()]),
    onlyStoryFiles: z.array(z.string()),
    onlyStoryNames: z.array(z.string()),
    untraced: z.array(z.string()),
    externals: z.array(z.string()),
    debug: z.boolean(),
    junitReport: z.union([z.string(), z.boolean()]),
    autoAcceptChanges: z.union([z.string(), z.boolean()]),
    exitZeroOnChanges: z.union([z.string(), z.boolean()]),
    exitOnceUploaded: z.union([z.string(), z.boolean()]),
    ignoreLastBuildOnBranch: z.string(),

    buildScriptName: z.string(),
    outputDir: z.string(),

    storybookBuildDir: z.string(),
    storybookBaseDir: z.string(),
    storybookConfigDir: z.string(),

    ownerName: z.string(),
    repositorySlug: z.string(),
  })
  .partial();

export type Configuration = z.infer<typeof configurationSchema>;

export async function getConfiguration(configFile?: string) {
  const usedConfigFile = configFile || 'chromatic.config.json';
  try {
    const rawJson = await readFile(usedConfigFile);

    return configurationSchema.parse(rawJson);
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
