import { buildManifest, serializeManifest } from '@cli/turbosnap/v2/manifest';
import { realProjectFiles } from '@cli/turbosnap/v2/projectFiles';
import meow from 'meow';

import { createLogger } from '../node-src/lib/log';
import { getSourceModuleResolution } from '../node-src/lib/turbosnap/v2/statsAnchor';
import {
  readTurbosnapInput,
  TURBOSNAP_INPUT_OPTIONS_HELP,
  turbosnapInputFlags,
} from './turbosnapInput';

/**
 * Utility to build the TurboSnap v2 manifest from a preview-stats.json and print it to stdout. It
 * is the local/debug counterpart to `chromatic trace` (TurboSnap v1): it hashes the source files
 * referenced by the stats file and derives the per-story and whole-Storybook hashes, without the
 * GraphQL step used during a real build.
 *
 * Command:
 *   chromatic turbosnap-manifest [-s|--stats-file] [-b|--storybook-base-dir] [-c|--config-dir]
 *                                [--static-dir] [--build-script-name]
 *
 * The stats file path is resolved relative to the Storybook base directory, so a monorepo project
 * only needs to pass the base directory:
 *   npx chromatic turbosnap-manifest -b packages/ui > turbosnap-manifest.json
 *
 * The config and static directories are hashed off disk, because they are never bundler inputs, and
 * they are derived the same way a real build derives them; see `readTurbosnapInput`. `-c` and
 * `--static-dir` override that, and are the only inputs here that a real build has no equivalent for.
 *
 * Because the manifest hashes files off disk, run this in a checkout where the source tree
 * referenced by the stats file exists.
 *
 * This command builds the manifest directly and so runs none of v2's bails. Use
 * `chromatic turbosnap-bail` for those.
 */

/**
 * The main entrypoint for `chromatic turbosnap-manifest`.
 *
 * @param argv A list of arguments passed.
 */
export async function main(argv: string[]) {
  const { flags } = meow(
    `
    Usage
      $ chromatic turbosnap-manifest [-s|--stats-file] [-b|--storybook-base-dir] [-c|--config-dir] [--static-dir] [--build-script-name]

    Options
${TURBOSNAP_INPUT_OPTIONS_HELP}
    `,
    {
      argv,
      description: 'Build the TurboSnap v2 manifest from a stats file',
      flags: turbosnapInputFlags,
    }
  );

  // Errors go to stderr (console.error); at this level info/debug logs are suppressed so the
  // manifest JSON is the only thing on stdout.
  const log = createLogger({}, { logPrefix: '', logLevel: 'error' });

  try {
    const input = await readTurbosnapInput(flags, log);
    const projectFiles = realProjectFiles();
    const resolution = getSourceModuleResolution(input.stats, {
      projectRoot: input.projectRoot,
      repositoryRoot: input.repositoryRoot,
      configDir: input.configDir,
      projectFiles,
    });

    const manifest = await buildManifest(
      input.stats,
      input.projectRoot,
      {
        configDir: input.configDir,
        staticDirs: input.staticDirs,
        projectFiles,
      },
      // This command runs no anchor bail, so a stats file that resolves nowhere silently anchors at
      // the project root instead of raising the mismatch production would.
      resolution.statsRoot ?? input.projectRoot
    );

    process.stdout.write(JSON.stringify(serializeManifest(manifest)));
  } catch (err) {
    log.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
