import meow from 'meow';
import path from 'path';

import { createLogger } from '../node-src/lib/log';
import { generateManifest } from '../node-src/lib/react-native/generateManifest';
import { Context } from '../node-src/types';

/**
 * Utility to generate a manifest.json file for React Native Storybook projects.
 * This command reads your Storybook configuration and creates a manifest file that lists all
 * stories in your project. This is useful if you want to only test some stories by updating the
 * resulting manfiest before running a build.
 *
 * Command:
 *   chromatic generate-manifest -o <output-dir> [-c <config-dir>]
 *
 * The generated manifest.json contains:
 *   - stories: Array of story objects with metadata
 *   - json: Array of story entries from the index
 */

/**
 * The main entrypoint for `chromatic generate-manifest`.
 *
 * @param argv A list of arguments passed.
 */
export async function main(argv: string[]) {
  const { flags } = meow(
    `
    Usage
      $ chromatic generate-manifest -o <output-dir> [-c <config-dir>]

    Options
      --output-dir, -o <dirname>            Directory where manifest.json will be written (required)
      --storybook-config-dir, -c <dirname>  Directory where to load Storybook configurations from (default: '.rnstorybook')

    Examples
      $ chromatic generate-manifest -o ./storybook-static
      $ chromatic generate-manifest -o ./.storybook-static -c ./custom-config
    `,
    {
      argv,
      description: 'Generate manifest.json for React Native Storybook',
      flags: {
        outputDir: {
          type: 'string',
          alias: 'o',
        },
        storybookConfigDir: {
          type: 'string',
          alias: 'c',
          default: '.rnstorybook',
        },
      },
    }
  );

  const log = createLogger({}, { logPrefix: '', logLevel: 'debug' });

  if (!flags.outputDir) {
    log.error('Error: --output-dir is required');
    return;
  }

  const ctx: Context = {
    log,
    options: {
      storybookConfigDir: flags.storybookConfigDir,
    },
    sourceDir: path.resolve(flags.outputDir),
  } as any;

  try {
    await generateManifest(ctx);
  } catch (err) {
    log.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
