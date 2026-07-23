import { buildManifest, serializeManifest } from '@cli/turbosnap/v2/manifest';
import meow from 'meow';
import path from 'path';

import { getRepositoryRoot } from '../node-src/git/git';
import { createLogger } from '../node-src/lib/log';
import { readStatsFile } from '../node-src/tasks/readStatsFile';

/**
 * Utility to build the TurboSnap v2 manifest from a preview-stats.json and print it to stdout. It
 * is the local/debug counterpart to `chromatic trace` (TurboSnap v1): it hashes the source files
 * referenced by the stats file and derives the per-story and whole-Storybook hashes, without the
 * GraphQL step used during a real build.
 *
 * Command:
 *   chromatic turbosnap-manifest [-s|--stats-file] [-b|--storybook-base-dir]
 *
 * The stats file path is resolved relative to the Storybook base directory, so a monorepo project
 * only needs to pass the base directory:
 *   npx chromatic turbosnap-manifest -b packages/ui > turbosnap-manifest.json
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
      $ chromatic turbosnap-manifest [-s|--stats-file] [-b|--storybook-base-dir]

    Options
      --stats-file, -s <filepath>           Path to preview-stats.json, relative to the Storybook base directory. (default: 'storybook-static/preview-stats.json')
      --storybook-base-dir, -b <dirname>    Relative path from repository root to Storybook project root. Use when your Storybook is located in a subdirectory of your repository. (default: '.')
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
          default: STORYBOOK_BASE_DIR || '.',
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
    const projectRoot = rootPath ? path.resolve(rootPath, flags.storybookBaseDir) : process.cwd();

    // Anchor the stats file at the same project root, so passing only --storybook-base-dir locates
    // both the stats file and the source tree it references under that directory.
    const stats = await readStatsFile(path.resolve(projectRoot, flags.statsFile));
    const manifest = await buildManifest(stats, projectRoot);

    process.stdout.write(JSON.stringify(serializeManifest(manifest)));
  } catch (err) {
    log.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
