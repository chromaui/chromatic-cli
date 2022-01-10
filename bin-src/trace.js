import fs from 'fs-extra';
import meow from 'meow';
import { getDependentStoryFiles } from './lib/getDependentStoryFiles';

/**
 * Utility to trace a set of changed file paths to dependent story files using a Webpack stats file.
 * Given a path to `preview-stats.json` and a list of "changed" file paths, it returns a set of
 * story files that depend on any of the changed files.
 *
 * Command:
 *   chromatic trace [...changed file paths]
 *
 * Usage:
 *   yarn chromatic trace -s ./path/to/preview-stats.json ./src/button.js ./src/header.js
 */

const { STORYBOOK_BASE_DIR, STORYBOOK_CONFIG_DIR, WEBPACK_STATS_FILE } = process.env;

export async function main(argv) {
  const { flags, input } = meow(
    `
    Usage
      $ chromatic trace [...changed file paths]

    Options
      --base-dir <dirname>, -b  Relative path from repository root to Storybook project root. Alternatively, set STORYBOOK_BASE_DIR. Use when your Storybook is located in a subdirectory of your repository.
      --config-dir <dirname>, -c  Directory where to load Storybook configurations from. Alternatively, set STORYBOOK_CONFIG_DIR. (default: '.storybook')
      --stats-file <filepath>, -s  Path to preview-stats.json. Alternatively, set WEBPACK_STATS_FILE. (default: 'storybook-static/preview-stats.json')
      --untraced <filepath>, -u  Disregard these files and their dependencies. Globs are supported via picomatch. This flag can be specified multiple times.
      --expand  Expand modules to their underlying list of files
    `,
    {
      argv,
      flags: {
        baseDir: {
          type: 'string',
          alias: 'b',
          default: STORYBOOK_BASE_DIR || '.',
        },
        configDir: {
          type: 'string',
          alias: 'c',
          default: STORYBOOK_CONFIG_DIR || '.storybook',
        },
        statsFile: {
          type: 'string',
          alias: 's',
          default: WEBPACK_STATS_FILE || 'storybook-static/preview-stats.json',
        },
        untraced: {
          type: 'string',
          alias: 'u',
          isMultiple: true,
        },
        expand: {
          type: 'boolean',
          default: false,
        },
      },
    }
  );

  const ctx = {
    log: console,
    storybook: {
      configDir: flags.configDir,
    },
    options: {
      storybookBaseDir: flags.baseDir,
      untraced: flags.untraced,
      traceChanged: flags.expand ? 'expanded' : true,
    },
    turboSnap: {},
  };
  const stats = await fs.readJson(flags.statsFile);
  const changedFiles = input.map((f) => f.replace(/^\.\//, ''));

  await getDependentStoryFiles(ctx, stats, flags.statsFile, changedFiles);
}
