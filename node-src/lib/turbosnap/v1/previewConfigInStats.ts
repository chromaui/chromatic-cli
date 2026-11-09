import { Context, Stats } from '../../../types';
import { findStorybookConfigFile, PREVIEW_CONFIG_PATTERN } from '../../getStorybookMetadata';
import { relativeTo } from '../../getStorybookProjectRoot';
import {
  getStatsProjectRoot,
  moduleFileNames,
  normalizeStatsName,
  stripConcatenatedModuleSuffix,
} from '../statsPaths';
import { isPreviewConfig } from '../storybookConfigFiles';

/**
 * Checks whether the stats file's module graph has the config directory's `preview.*`, either as a
 * module or as the importer of one. Vite's stats name it only as an importer, which is enough to
 * trace a change to what it imports. When it's in neither place, a change to a file only `preview.*`
 * imports can't be traced to it, so the index records the answer to measure how often that happens.
 *
 * @param ctx The context set when executing the CLI.
 * @param stats The parsed stats file.
 *
 * @returns Whether the stats file has the preview config, or `undefined` when the config directory
 * has no `preview.*` file (or can't be read), since then there is nothing to find.
 */
export async function isPreviewConfigInStats(
  ctx: Context,
  stats: Stats
): Promise<boolean | undefined> {
  const { rootPath } = ctx.git;
  if (!rootPath) return undefined;

  const projectRoot = getStatsProjectRoot(ctx);
  const configDirectory = ctx.storybook.configDir;
  const previewConfig = await findStorybookConfigFile(
    configDirectory,
    PREVIEW_CONFIG_PATTERN
  ).catch(() => undefined);
  if (!previewConfig) return undefined;

  const storybookDirectory = relativeTo(rootPath, configDirectory);
  const isPreview = (name: string) =>
    isPreviewConfig(
      stripConcatenatedModuleSuffix(normalizeStatsName(name, rootPath, projectRoot)),
      storybookDirectory
    );
  return stats.modules.some(
    (module_) =>
      moduleFileNames(module_).some((name) => isPreview(name)) ||
      (module_.reasons ?? []).some(({ moduleName }) => !!moduleName && isPreview(moduleName))
  );
}
