import meow from 'meow';

import { getRepositoryRoot } from '../node-src/git/git';
import { getDependentStoryFiles } from '../node-src/lib/getDependentStoryFiles';
import { isPackageManifestFile } from '../node-src/lib/utils';
import { readStatsFile } from '../node-src/tasks/readStatsFile';
import { Context } from '../node-src/types';

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

/**
 * The main entrypoint for `chromatic trace`.
 *
 * @param argv A list of arguments passed.
 */
export async function main(argv: string[]) {
  const { flags, input } = meow(
    `
    Usage
      $ chromatic trace [-b|--base-dir] [-c|--config-dir] [-s|--stats-file] [-u|--untraced] [-m|--mode] [<changed files>...]

    Options
      <changed files>...                    List of changed files relative to repository root.
      --stats-file, -s <filepath>           Path to preview-stats.json. Alternatively, set WEBPACK_STATS_FILE. (default: 'storybook-static/preview-stats.json')
      --storybook-base-dir, -b <dirname>    Relative path from repository root to Storybook project root. Alternatively, set STORYBOOK_BASE_DIR. Use when your Storybook is located in a subdirectory of your repository.
      --storybook-config-dir, -c <dirname>  Directory where to load Storybook configurations from. Alternatively, set STORYBOOK_CONFIG_DIR. (default: '.storybook')
      --untraced, -u <filepath>             Disregard these files and their dependencies. Globs are supported via picomatch. This flag can be specified multiple times.
      --mode, -m <mode>                     Set to 'expanded' to reveal the underlying list of files for each bundle, or set to 'compact' to only show a flat list of affected story files.
    `,
    {
      argv,
      description: 'Trace utility for TurboSnap',
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
        storybookConfigDir: {
          type: 'string',
          alias: 'c',
          default: STORYBOOK_CONFIG_DIR || '.storybook',
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

  const ctx: Context = {
    log: console,
    options: {
      storybookBaseDir: flags.storybookBaseDir,
      storybookConfigDir: flags.storybookConfigDir,
      untraced: flags.untraced,
      traceChanged: flags.mode || true,
    },
    git: {
      rootPath: await getRepositoryRoot(),
    },
  } as any;
  const stats = await readStatsFile(flags.statsFile);
  const changedFiles = input.map((f) => f.replace(/^\.\//, ''));

  const packageManifestFile = changedFiles.find((item) => isPackageManifestFile(item));
  if (packageManifestFile) {
    throw new Error(
      `Unable to trace package manifest file (${packageManifestFile}) as that would require diffing file contents.`
    );
  }

  await getDependentStoryFiles(ctx, stats, flags.statsFile, changedFiles, [], {
    skipCwdCheck: true,
  });
}
