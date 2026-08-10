import { readJson } from 'fs-extra';
import path from 'path';

import { findBuildScriptName } from '../getOptions';
import { findConfigFlags, findStaticDirectories, readMainConfig } from '../getStorybookMetadata';
import { Logger } from '../log';
import { posix } from '../posix';

/** The Storybook directories TurboSnap v2 hashes from disk, relative to the project root. */
export interface StorybookDirectories {
  /** The project-relative Storybook config directory. */
  configDir: string;
  /** The project-relative static directories. */
  staticDirs: string[];
}

export interface StorybookDirectoriesInput {
  /** The absolute Storybook project root the directories are relative to. */
  projectRoot: string;
  /** The logger the config read reports its parse path to. */
  log: Logger;
  /** An explicitly configured config directory, which wins over the build script's `-c`. */
  configDir?: string;
  /**
   * Explicitly configured static directories, which wins over the derived ones.
   * Note: An empty array means the project has no static directories, so nothing is derived from
   * the build script or the main config. Pass `undefined` to derive them instead.
   */
  staticDirs?: string[];
  /** The build script the user asked for, which wins over the heuristic in `findBuildScriptName`. */
  buildScriptName?: string;
}

/**
 * Reads the Storybook config and static directories out of the project's own source config.
 *
 * TurboSnap v2 derives these here rather than reading them off `ctx.storybook`, because that
 * metadata resolves the directories against the cwd, and v2 hashes files relative to the Storybook
 * project root to match the builder output.
 *
 * @param input Where to read from, and any explicitly configured directories.
 * @param input.projectRoot The absolute Storybook project root.
 * @param input.log The logger the config read reports its parse path to.
 * @param input.configDir An explicitly configured config directory.
 * @param input.staticDirs Explicitly configured static directories, empty array included.
 * @param input.buildScriptName The build script the user asked for.
 *
 * @returns The project-relative config and static directories.
 */
export async function readStorybookDirectories({
  projectRoot,
  log,
  configDir: explicitConfigDirectory,
  staticDirs: explicitStaticDirectories,
  buildScriptName,
}: StorybookDirectoriesInput): Promise<StorybookDirectories> {
  const buildScriptFlags = await readBuildScriptFlags(projectRoot, buildScriptName, log);
  const configDirectory = toProjectRelative(
    projectRoot,
    explicitConfigDirectory ?? buildScriptFlags.configDir ?? '.storybook'
  );

  const staticDirectories =
    explicitStaticDirectories ??
    (await deriveStaticDirectories({
      projectRoot,
      log,
      configDirectory,
      buildScriptStaticDirs: buildScriptFlags.staticDir,
    }));

  return { configDir: configDirectory, staticDirs: staticDirectories };
}

/**
 * Reads the `-c`/`-s` flags out of the project's Storybook build script.
 *
 * @param projectRoot The absolute Storybook project root.
 * @param buildScriptName The build script the user asked for, if any.
 * @param log The logger the read reports a missing or unreadable package.json to.
 *
 * @returns The build script's config and static directories, or nothing when there is no script.
 */
async function readBuildScriptFlags(
  projectRoot: string,
  buildScriptName: string | undefined,
  log: Logger
) {
  try {
    const packageJson = await readJson(path.join(projectRoot, 'package.json'));
    return await findConfigFlags({
      buildScriptName: findBuildScriptName(packageJson.scripts, buildScriptName),
      packageJson,
    });
  } catch (err) {
    log.debug('Failed to read config flags from package.json', err);
    return {};
  }
}

/**
 * Derives the static directories from the build script's `-s` flag and the main config's
 * `staticDirs`. Storybook rejects both at once (and dropped `-s` in v8), so in practice only one is
 * populated; the union covers both.
 *
 * @param input Where to read from, and the directories already known.
 * @param input.projectRoot The absolute Storybook project root.
 * @param input.configDirectory The project-relative Storybook config directory.
 * @param input.log The logger the config read reports its parse path to.
 * @param input.buildScriptStaticDirs The build script's `-s` directories, if any.
 *
 * @returns The merged, project-relative static directories.
 */
async function deriveStaticDirectories({
  projectRoot,
  log,
  configDirectory,
  buildScriptStaticDirs,
}: {
  projectRoot: string;
  log: Logger;
  configDirectory: string;
  buildScriptStaticDirs?: string[];
}) {
  // Returns nothing when the config can't be read or declares no `staticDirs`.
  const mainConfig = await readMainConfig(path.resolve(projectRoot, configDirectory), log);
  const { staticDir } = findStaticDirectories(mainConfig, configDirectory);

  const directories = [...(buildScriptStaticDirs ?? []), ...(staticDir ?? [])];
  // Both sources are normalized before the dedupe, so `public` and `./public` count as one.
  return [...new Set(directories.map((directory) => toProjectRelative(projectRoot, directory)))];
}

/**
 * Rewrites a directory as a posix path relative to the project root, whichever form it arrived in.
 * Absolute paths and `./`-prefixed paths both reach us from user config, and the directories we
 * hand back are hashed relative to the project root.
 *
 * @param projectRoot The absolute Storybook project root.
 * @param directory The directory to rewrite.
 *
 * @returns The project-relative posix path.
 */
function toProjectRelative(projectRoot: string, directory: string) {
  return posix(path.relative(projectRoot, path.resolve(projectRoot, directory)));
}
