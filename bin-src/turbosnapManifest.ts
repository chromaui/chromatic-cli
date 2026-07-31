import { buildManifest, serializeManifest } from '@cli/turbosnap/v2/manifest';
import { readJson } from 'fs-extra';
import meow from 'meow';
import path from 'path';

import { getRepositoryRoot } from '../node-src/git/git';
import { findBuildScriptName } from '../node-src/lib/getOptions';
import { getStorybookBaseDirectory } from '../node-src/lib/getStorybookBaseDirectory';
import {
  findConfigFlags,
  findStaticDirectories,
  readMainConfig,
} from '../node-src/lib/getStorybookMetadata';
import { createLogger, Logger } from '../node-src/lib/log';
import { readStatsFile } from '../node-src/tasks/readStatsFile';

/**
 * Utility to build the TurboSnap v2 manifest from a preview-stats.json and print it to stdout. It
 * is the local/debug counterpart to `chromatic trace` (TurboSnap v1): it hashes the source files
 * referenced by the stats file and derives the per-story and whole-Storybook hashes, without the
 * GraphQL step used during a real build.
 *
 * Command:
 *   chromatic turbosnap-manifest [-s|--stats-file] [-b|--storybook-base-dir] [-c|--config-dir]
 *                                [--static-dir]
 *
 * The stats file path is resolved relative to the Storybook base directory, so a monorepo project
 * only needs to pass the base directory:
 *   npx chromatic turbosnap-manifest -b packages/ui > turbosnap-manifest.json
 *
 * The config and static directories are hashed off disk, because they are never bundler inputs, and
 * they are derived the same way a real build derives them: the project's Storybook build script
 * supplies `-c`/`-s`, and `staticDirs` is read out of `main.*` through the shared
 * `readMainConfig`/`findStaticDirectories` pair. `-c` and `--static-dir` override that, and are the
 * only inputs here that a real build has no equivalent for.
 *
 * Because the manifest hashes files off disk, run this in a checkout where the source tree
 * referenced by the stats file exists.
 */

const { STORYBOOK_BASE_DIR, WEBPACK_STATS_FILE } = process.env;

/**
 * The main entrypoint for `chromatic turbosnap-manifest`.
 *
 * @param argv A list of arguments passed.
 */
export async function main(argv: string[]) {
  const { flags } = meow(
    `
    Usage
      $ chromatic turbosnap-manifest [-s|--stats-file] [-b|--storybook-base-dir] [-c|--config-dir] [--static-dir]

    Options
      --stats-file, -s <filepath>           Path to preview-stats.json, relative to the Storybook base directory. (default: 'storybook-static/preview-stats.json')
      --storybook-base-dir, -b <dirname>    Relative path from repository root to Storybook project root. Use when your Storybook is located in a subdirectory of your repository. (default: the current directory, relative to the repository root)
      --config-dir, -c <dirname>            Storybook config directory, relative to the Storybook base directory. (default: the build script's -c, else '.storybook')
      --static-dir <dirnames>               Comma-separated static directories, relative to the Storybook base directory. (default: the build script's -s merged with main.*'s staticDirs)
    `,
    {
      argv,
      description: 'Build the TurboSnap v2 manifest from a stats file',
      flags: {
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
      },
    }
  );

  // Errors go to stderr (console.error); at this level info/debug logs are suppressed so the
  // manifest JSON is the only thing on stdout.
  const log = createLogger({}, { logPrefix: '', logLevel: 'error' });

  try {
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
    const stats = await readStatsFile(path.resolve(projectRoot, flags.statsFile));
    const buildScriptFlags = await readBuildScriptFlags(projectRoot);
    const configDirectory = flags.configDir ?? buildScriptFlags.configDir ?? '.storybook';
    const manifest = await buildManifest(stats, projectRoot, {
      configDir: configDirectory,
      staticDirs: flags.staticDir
        ? flags.staticDir.split(',')
        : await readStaticDirectories(
            log,
            projectRoot,
            configDirectory,
            buildScriptFlags.staticDir
          ),
    });

    process.stdout.write(JSON.stringify(serializeManifest(manifest)));
  } catch (err) {
    log.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Reads the `-c`/`-s` flags out of the project's Storybook build script, the same source production
 * reads them from, so this command's config and static directories are not silently narrower.
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
 * `getStorybookMetadata` does, so this command's `<staticFiles>` entry matches production without
 * the caller naming the directories.
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
  const { mainConfig, isAstConfig } = await readMainConfig(
    path.resolve(projectRoot, configDirectory),
    log
  );
  const { staticDir } = findStaticDirectories(mainConfig, isAstConfig, configDirectory);
  return [...new Set([...buildScriptStaticDirectories, ...(staticDir ?? [])])];
}
