import { readJson } from 'fs-extra';
import path from 'path';

import { findBuildScriptName } from '../getOptions';
import {
  findConfigFlags,
  findStaticDirectories,
  mergeStaticDirectories,
  readMainConfig,
} from '../getStorybookMetadata';
import { Logger } from '../log';

/** The Storybook directories TurboSnap v2 hashes off disk, relative to the project root. */
export interface StorybookDirectories {
  /** The project-relative Storybook config directory. */
  configDir: string;
  /** The project-relative static directories. */
  staticDirs: string[];
}

/**
 * The main config files v2 parses, adding `main.mjs` and `main.cjs` to the shared pattern.
 *
 * `require()` only auto-appends `.js`/`.json`/`.node` to an extensionless path, so those two reach
 * the AST parser or nothing at all. The wider pattern lives here rather than in
 * `getStorybookMetadata` so parsing them cannot add fields to `ctx.storybook` that v1 reads.
 */
const V2_MAIN_CONFIG_PATTERN = /^main\.[cm]?[jt]sx?$/;

export interface StorybookDirectoriesInput {
  /** The absolute Storybook project root the directories are relative to. */
  projectRoot: string;
  /** The logger the config read reports its parse path to. */
  log: Logger;
  /** An explicitly configured config directory, which wins over the build script's `-c`. */
  configDir?: string;
  /** Explicitly configured static directories, which replace the derived ones. */
  staticDirs?: string[];
  /** The build script the user asked for, which wins over the heuristic in `findBuildScriptName`. */
  buildScriptName?: string;
}

/**
 * Reads the Storybook config and static directories out of the project's own source config.
 *
 * TurboSnap v2 derives these here rather than reading them off `ctx.storybook`, because on the
 * `--storybook-build-dir` path that metadata comes from the prebuilt `project.json` and carries no
 * directories. Putting them there instead would change what TurboSnap v1 sees, since v1 reads
 * `configDir` and `staticDir` to decide its static-file bails.
 *
 * @param input Where to read from, and any explicitly configured directories.
 * @param input.projectRoot The absolute Storybook project root.
 * @param input.log The logger the config read reports its parse path to.
 * @param input.configDir An explicitly configured config directory.
 * @param input.staticDirs Explicitly configured static directories.
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
  const buildScriptFlags = await readBuildScriptFlags(projectRoot, buildScriptName);
  const configDirectory = explicitConfigDirectory ?? buildScriptFlags.configDir ?? '.storybook';
  if (explicitStaticDirectories) {
    return { configDir: configDirectory, staticDirs: explicitStaticDirectories };
  }

  // Returns nothing when the config can't be read or declares no `staticDirs`.
  const mainConfig = await readMainConfig(
    path.resolve(projectRoot, configDirectory),
    log,
    V2_MAIN_CONFIG_PATTERN
  );
  const { staticDir } = findStaticDirectories(mainConfig, configDirectory);

  return {
    configDir: configDirectory,
    staticDirs: mergeStaticDirectories(buildScriptFlags.staticDir, staticDir),
  };
}

/**
 * Reads the `-c`/`-s` flags out of the project's Storybook build script, the same source
 * `getStorybookMetadata` reads them from, and for the same script production resolved.
 *
 * @param projectRoot The absolute Storybook project root.
 * @param buildScriptName The build script the user asked for, if any.
 *
 * @returns The build script's config and static directories, or nothing when there is no script.
 */
async function readBuildScriptFlags(projectRoot: string, buildScriptName?: string) {
  try {
    const packageJson = await readJson(path.join(projectRoot, 'package.json'));
    return await findConfigFlags({
      buildScriptName: findBuildScriptName(packageJson.scripts, buildScriptName),
      packageJson,
    });
  } catch {
    return {};
  }
}
