import fs from 'fs-extra';
import { join } from 'path';
import { getDependentStoryFiles } from './lib/getDependentStoryFiles';

/**
 * Utility to trace a set of changed file paths to dependent story files using a Webpack stats file.
 * Given a path to `preview-stats.json` and a list of "changed" file paths, it returns a set of
 * story files that depend on any of the changed files.
 *
 * Command:
 *   chromatic stats-to-story-files [path to preview-stats.json] [...changed file paths]
 *
 * Usage examples:
 *   yarn chromatic stats-to-story-files ./path/to/preview-stats.json ./src/button.js ./src/header.js
 *   yarn chromatic stats-to-story-files ./storybook-static/preview-stats.json ./bin/ui/components/link.js
 *
 * This prints the number of detected CSF globs, the total number of modules, and a map of
 *   `Webpack module ID -> file path` for each of the found story files (typically `*.stories.js`)
 *
 * Example output:
 *   Found 2 CSF globs
 *   Found 218 user modules
 *   {
 *     '114': './bin/ui/messages/info/buildPassed.stories.js',
 *     '228': './bin/ui/messages/errors/buildHasChanges.stories.js',
 *     '229': './bin/ui/messages/info/storybookPublished.stories.js',
 *     ...
 *   }
 *
 * You can generate a preview-stats.json like so (requires Storybook >=6.3):
 *   yarn build-storybook --webpack-stats-json
 *
 * This script assumes your config directory is `./.storybook`, you can use `STORYBOOK_CONFIG_DIR` to change that
 */

export async function main([statsFile, ...changedFiles]) {
  const stats = await fs.readJson(statsFile);
  const ctx = {
    log: console,
    storybook: {
      configDir: process.env.STORYBOOK_CONFIG_DIR || '.storybook',
      staticDir: ['static'],
    },
  };
  // eslint-disable-next-line no-console
  console.log(await getDependentStoryFiles(ctx, stats, statsFile, changedFiles));
}
