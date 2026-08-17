import { type DependentStoryFilesResult, getDependentStoryFiles } from '@cli/turbosnap/v1';
import meow from 'meow';

import { getRepositoryRoot } from '../node-src/git/git';
import { createLogger } from '../node-src/lib/log';
import { isPackageManifestFile } from '../node-src/lib/utilities';
import { readStatsFile } from '../node-src/tasks/readStatsFile';
import { Context } from '../node-src/types';

/**
 * Utility to trace a set of changed file paths to dependent story files using a Webpack stats file.
 * Given a list of "changed" file paths, it returns a set of story files that depend on any of the
 * changed files. This report is also available when running a build by passing `--trace-changed`.
 *
 * Command:
 *   chromatic trace [-b|--base-dir] [-c|--config-dir] [-s|--stats-file] [-u|--untraced] [-m|--mode]
 *                   [-d|--changed-dependency] [--json] [<changed files>...]
 *
 * Usage example:
 *   npx chromatic trace -s ./path/to/preview-stats.json ./src/button.js ./src/header.js
 *
 * Pass `--changed-dependency` to model a dependency upgrade. During a build these names come from
 * `findChangedDependencies`, which diffs the lockfile between commits; passing them directly lets
 * you trace an upgrade without constructing that git history.
 *
 * Pass `--json` for a machine-readable result (`status`, `storyFiles`, `bailReason`) instead of the
 * human-readable trace.
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
      --changed-dependency, -d <name>       Treat this package as upgraded, as a lockfile diff would report it. This flag can be specified multiple times.
      --json                                Print the result as JSON (status, storyFiles, bailReason) instead of a human-readable trace.
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
        changedDependency: {
          type: 'string',
          alias: 'd',
          isMultiple: true,
        },
        json: {
          type: 'boolean',
          default: false,
        },
      },
    }
  );

  // In JSON mode the result is the only thing on stdout, so suppress the trace report and any
  // logging below the error level.
  const log = createLogger({}, { logPrefix: '', logLevel: flags.json ? 'error' : 'info' });
  const ctx: Context = {
    log,
    options: {
      storybookBaseDir: flags.storybookBaseDir,
      storybookConfigDir: flags.storybookConfigDir,
      untraced: flags.untraced,
      traceChanged: flags.json ? false : flags.mode || true,
    },
    git: {
      rootPath: await getRepositoryRoot({ log }),
    },
    storybook: {
      baseDir: flags.storybookBaseDir,
      configDir: flags.storybookConfigDir,
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

  const result = await getDependentStoryFiles(
    ctx,
    stats,
    flags.statsFile,
    changedFiles,
    flags.changedDependency
  );

  if (flags.json) {
    process.stdout.write(`${JSON.stringify(summarizeResult(result))}\n`);
  }
}

/**
 * Reduces a trace result to the machine-readable shape printed by `--json`: the affected story
 * files as a flat sorted list, plus the bail reason when TurboSnap gave up.
 *
 * @param result The result returned by `getDependentStoryFiles`.
 *
 * @returns The status, affected story files, and bail reason (when bailed).
 */
function summarizeResult(result: DependentStoryFilesResult) {
  if (result.status === 'bailed') {
    return { status: result.status, storyFiles: [], bailReason: result.turboSnap.bailReason };
  }

  const storyFiles = Object.values(result.onlyStoryFiles).flat();
  return { status: result.status, storyFiles: [...new Set(storyFiles)].sort() };
}
