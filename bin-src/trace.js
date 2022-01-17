import fs from 'fs-extra';
import meow from 'meow';
import { getDependentStoryFiles } from './lib/getDependentStoryFiles';

/**
 * Utility to trace a set of changed file paths to dependent story files using a Webpack stats file.
 * Given a list of "changed" file paths, it returns a set of story files that depend on any of the
 * changed files. This report is also available when running a build by passing `--trace-changed`.
 *
 * Command:
 *   chromatic trace [-b|--base-dir] [-c|--config-dir] [-s|--stats-file] [-u|--untraced] [-m|--mode] [<changed files>...]
 *
 * Usage example:
 *   npx chromatic trace -s ./path/to/preview-stats.json ./src/button.js ./src/header.js
 *
 * Example output:
 *   ℹ Traced 2 changed files to 1 affected story file:
 *   — src/button.js [changed]
 *     ∟ src/button.stories.tsx
 *       ∟ [story index]
 *
 * You can set the --mode (-m) flag to change the verbosity:
 *   - compact: prints only the list of dependent story files, not how they're connected
 *   - expanded: prints the underlying files for each bundle
 *
 * You can generate a preview-stats.json like so (requires Storybook >=6.3):
 *   npx build-storybook --webpack-stats-json
 */

const { STORYBOOK_BASE_DIR, STORYBOOK_CONFIG_DIR, WEBPACK_STATS_FILE } = process.env;

export async function main(argv) {
  const { flags, input } = meow(
    `
    Usage
      $ chromatic trace [-b|--base-dir] [-c|--config-dir] [-s|--stats-file] [-u|--untraced] [-m|--mode] [<changed files>...]

    Options
      <changed files>...  List of changed files relative to repository root.
      --base-dir <dirname>, -b  Relative path from repository root to Storybook project root. Alternatively, set STORYBOOK_BASE_DIR. Use when your Storybook is located in a subdirectory of your repository.
      --config-dir <dirname>, -c  Directory where to load Storybook configurations from. Alternatively, set STORYBOOK_CONFIG_DIR. (default: '.storybook')
      --stats-file <filepath>, -s  Path to preview-stats.json. Alternatively, set WEBPACK_STATS_FILE. (default: 'storybook-static/preview-stats.json')
      --untraced <filepath>, -u  Disregard these files and their dependencies. Globs are supported via picomatch. This flag can be specified multiple times.
      --mode <mode>, -m  Set to 'expanded' to reveal the underlying list of files for each bundle, or set to 'compact' to only show a flat list of affected story files.
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
        mode: {
          type: 'string',
          alias: 'm',
        },
      },
    }
  );

  const ctx = {
    log: console,
    options: {
      storybookBaseDir: flags.baseDir,
      storybookConfigDir: flags.configDir,
      untraced: flags.untraced,
      traceChanged: flags.mode || true,
    },
  };
  const stats = await fs.readJson(flags.statsFile);
  const changedFiles = input.map((f) => f.replace(/^\.\//, ''));

  await getDependentStoryFiles(ctx, stats, flags.statsFile, changedFiles);
}
