import { readJson } from 'fs-extra';
import path from 'path';

import { getRepositoryRoot } from '../node-src/git/git';
import { findBuildScriptName } from '../node-src/lib/getOptions';
import { getStorybookBaseDirectory } from '../node-src/lib/getStorybookBaseDirectory';
import {
  findConfigFlags,
  findStaticDirectories,
  readMainConfig,
} from '../node-src/lib/getStorybookMetadata';
import { Logger } from '../node-src/lib/log';
import { readStatsFile } from '../node-src/tasks/readStatsFile';
import { Stats } from '../node-src/types';

const { STORYBOOK_BASE_DIR, WEBPACK_STATS_FILE } = process.env;

/**
 * The flags shared by every local TurboSnap v2 command, so `turbosnap-manifest` and
 * `turbosnap-bail` cannot derive the same input two different ways.
 */
export const turbosnapInputFlags = {
  statsFile: {
    type: 'string',
    alias: 's',
    default: WEBPACK_STATS_FILE || 'storybook-static/preview-stats.json',
  },
  storybookBaseDir: {
    type: 'string',
    alias: 'b',
    // meow rejects an undefined default, and there is no static one: an unset base directory
    // means "derive it the way production does", from the cwd and the repo root.
    ...(STORYBOOK_BASE_DIR && { default: STORYBOOK_BASE_DIR }),
  },
  configDir: {
    type: 'string',
    alias: 'c',
  },
  staticDir: {
    type: 'string',
  },
} as const;

/** The help text for {@link turbosnapInputFlags}, so both commands document them identically. */
export const TURBOSNAP_INPUT_OPTIONS_HELP = `      --stats-file, -s <filepath>           Path to preview-stats.json, relative to the Storybook base directory. (default: 'storybook-static/preview-stats.json')
      --storybook-base-dir, -b <dirname>    Relative path from repository root to Storybook project root. Use when your Storybook is located in a subdirectory of your repository. (default: the current directory, relative to the repository root)
      --config-dir, -c <dirname>            Storybook config directory, relative to the Storybook base directory. (default: the build script's -c, else '.storybook')
      --static-dir <dirnames>               Comma-separated static directories, relative to the Storybook base directory. (default: the build script's -s merged with main.*'s staticDirs)`;

export interface TurbosnapInputFlags {
  statsFile: string;
  storybookBaseDir?: string;
  configDir?: string;
  staticDir?: string;
}

/** The inputs a local TurboSnap v2 run derives from the flags, the checkout and the project. */
export interface TurbosnapInput {
  /** The absolute Storybook project root, anchoring both the stats file and the source tree. */
  projectRoot: string;
  /** The absolute repository root, which stats named from the repository root fall back to. */
  repositoryRoot: string;
  /** The absolute path the stats file was read from. */
  statsPath: string;
  stats: Stats;
  /** The project-relative Storybook config directory. */
  configDir: string;
  /** The project-relative static directories. */
  staticDirs: string[];
}

/**
 * Derives the project root, stats file, config directory and static directories the same way a real
 * build does, so a local run is not silently narrower than production.
 *
 * @param flags The parsed command flags.
 * @param log The logger the shared config read reports its parse path to.
 *
 * @returns The derived TurboSnap input.
 */
export async function readTurbosnapInput(
  flags: TurbosnapInputFlags,
  log: Logger
): Promise<TurbosnapInput> {
  const rootPath = await getRepositoryRoot({ log });
  // Anchor at the Storybook base directory when we know the repo root, matching the production
  // rule in node-src/lib/turbosnap/index.ts; otherwise fall back to the current directory.
  const projectRoot = rootPath
    ? path.resolve(
        rootPath,
        getStorybookBaseDirectory({
          storybookBaseDir: flags.storybookBaseDir,
          gitRootPath: rootPath,
        })
      )
    : process.cwd();

  // Anchor the stats file at the same project root, so passing only --storybook-base-dir locates
  // both the stats file and the source tree it references under that directory.
  const statsPath = path.resolve(projectRoot, flags.statsFile);
  const stats = await readStatsFile(statsPath);
  const buildScriptFlags = await readBuildScriptFlags(projectRoot);
  const configDirectory = flags.configDir ?? buildScriptFlags.configDir ?? '.storybook';

  return {
    projectRoot,
    // Matches production: the repository root when git knows it, else the project root itself.
    repositoryRoot: rootPath ? path.resolve(rootPath) : projectRoot,
    statsPath,
    stats,
    configDir: configDirectory,
    staticDirs: flags.staticDir
      ? flags.staticDir.split(',')
      : await readStaticDirectories(log, projectRoot, configDirectory, buildScriptFlags.staticDir),
  };
}

/**
 * Reads the `-c`/`-s` flags out of the project's Storybook build script, the same source production
 * reads them from, so the config and static directories are not silently narrower.
 *
 * @param projectRoot The absolute Storybook project root.
 *
 * @returns The build script's config and static directories, or nothing when there is no script.
 */
async function readBuildScriptFlags(projectRoot: string) {
  try {
    const packageJson = await readJson(path.join(projectRoot, 'package.json'));
    return await findConfigFlags({
      buildScriptName: findBuildScriptName(packageJson.scripts),
      packageJson,
    });
  } catch {
    return {};
  }
}

/**
 * Reads `staticDirs` out of the Storybook main config and merges the build script's, exactly as
 * `getStorybookMetadata` does, so `<staticFiles>` matches production without the caller naming the
 * directories.
 *
 * Returns nothing when the config can't be read or declares no `staticDirs` — the same blind spot a
 * real build has, and deliberately not papered over here.
 *
 * @param log The logger the shared config read reports its parse path to.
 * @param projectRoot The absolute Storybook project root.
 * @param configDirectory The project-relative Storybook config directory.
 * @param buildScriptStaticDirectories The static directories named by the build script's `-s`.
 *
 * @returns The project-relative static directories, or an empty array.
 */
async function readStaticDirectories(
  log: Logger,
  projectRoot: string,
  configDirectory: string,
  buildScriptStaticDirectories: string[] = []
): Promise<string[]> {
  const mainConfig = await readMainConfig(path.resolve(projectRoot, configDirectory), log);
  const { staticDir } = findStaticDirectories(mainConfig, configDirectory);
  return [...new Set([...buildScriptStaticDirectories, ...(staticDir ?? [])])];
}
