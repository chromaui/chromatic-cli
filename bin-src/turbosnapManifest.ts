import { buildManifest, serializeManifest } from '@cli/turbosnap/v2/manifest';
import { realProjectFiles } from '@cli/turbosnap/v2/projectFiles';
import { existsSync } from 'fs';
import meow from 'meow';
import path from 'path';

import { getRepositoryRoot } from '../node-src/git/git';
import { getStorybookProjectRoot } from '../node-src/lib/getStorybookProjectRoot';
import { createLogger } from '../node-src/lib/log';
import { readStatsFile } from '../node-src/tasks/readStatsFile';

/**
 * Utility to build the TurboSnap v2 manifest from a preview-stats.json and print it to stdout.
 *
 * Command:
 *   chromatic turbosnap-manifest [-s|--stats-file] [-b|--storybook-base-dir] [-c|--config-dir] [--static-dir]
 *
 * Usage example:
 *   npx chromatic turbosnap-manifest -b packages/ui > turbosnap-manifest.json
 *
 * The command flags have sensible defaults so the user may not need to supply too many flags.
 * Likely, the most used flag is going to be `--storybook-base-dir`/`-b` for monorepos.
 *
 * Because the manifest hashes files off disk, run this in the repo that produced the original
 * `preview-stats.json` file.
 */

const { STORYBOOK_BASE_DIR } = process.env;

/**
 * The main entrypoint for `chromatic turbosnap-manifest`.
 *
 * @param argv A list of arguments passed.
 *
 * @returns Nothing
 */
export async function main(argv: string[]) {
  const cli = meow(
    `
    Usage
      $ chromatic turbosnap-manifest [-s|--stats-file] [-b|--storybook-base-dir] [-c|--config-dir] [--static-dir]

    Options
      --stats-file, -s <filepath>           Path to preview-stats.json, relative to the Storybook project root. (default: 'storybook-static/preview-stats.json')
      --storybook-base-dir, -b <dirname>    Relative path from repository root to Storybook project root. Alternatively, set STORYBOOK_BASE_DIR. Use when your Storybook is located in a subdirectory of your repository. (default: the current directory)
      --config-dir, -c <dirname>            Storybook config directory, relative to the Storybook project root. (default: '.storybook')
      --static-dir <dirnames>               Comma-separated static directories, relative to the Storybook project root. (default: none)
    `,
    {
      argv,
      description: 'Build the TurboSnap v2 manifest from a stats file',
      flags: {
        statsFile: {
          type: 'string',
          alias: 's',
          default: 'storybook-static/preview-stats.json',
        },
        storybookBaseDir: {
          type: 'string',
          alias: 'b',
          // meow rejects an undefined default, and there is no static one: an unset base directory
          // means the current directory, which is resolved in the handler.
          ...(STORYBOOK_BASE_DIR && { default: STORYBOOK_BASE_DIR }),
        },
        configDir: {
          type: 'string',
          alias: 'c',
          default: '.storybook',
        },
        staticDir: {
          type: 'string',
        },
      },
    }
  );

  // Errors go to stderr, and info/debug logs are suppressed at this level, so the manifest JSON is
  // the only thing on stdout.
  const log = createLogger({}, { logPrefix: '', logLevel: 'error' });

  try {
    const projectRoot = getStorybookProjectRoot({
      storybookBaseDir: cli.flags.storybookBaseDir,
      gitRootPath: await getRepositoryRoot({ log }),
    });

    // The stats file is the one input with no default that works everywhere, so a project whose
    // Storybook builds elsewhere hits this first. Name the path we looked at and repeat the flags,
    // rather than leaving the user with a bare ENOENT.
    const statsPath = path.resolve(projectRoot, cli.flags.statsFile);
    if (!existsSync(statsPath)) {
      log.error(`No stats file at ${statsPath}\n`);
      log.error(cli.help);
      return process.exit(1);
    }

    const manifest = await buildManifest(await readStatsFile(statsPath), {
      projectRoot,
      configDir: path.resolve(projectRoot, cli.flags.configDir),
      staticDirs: (cli.flags.staticDir?.split(',') ?? []).map((directory) =>
        path.resolve(projectRoot, directory)
      ),
      projectFiles: realProjectFiles(),
    });

    process.stdout.write(JSON.stringify(serializeManifest(manifest), undefined, 2));
  } catch (err) {
    log.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
