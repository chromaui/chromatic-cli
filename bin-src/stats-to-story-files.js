/* eslint-disable no-console */

import fs from 'fs-extra';
import { getDependentStoryFiles } from './lib/getDependentStoryFiles';
import { getDiagnostics } from './lib/writeChromaticDiagnostics';

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
 *   Found 3 dependent story files:
 *   - bin/ui/messages/info/buildPassed.stories.js
 *   - bin/ui/messages/errors/buildHasChanges.stories.js
 *   - bin/ui/messages/info/storybookPublished.stories.js
 *
 * You can generate a preview-stats.json like so (requires Storybook >=6.3):
 *   yarn build-storybook --webpack-stats-json
 *
 * This script assumes your config directory is `./.storybook`, you can use `STORYBOOK_CONFIG_DIR` to change that.
 * Set `STORYBOOK_BASE_DIR` to change the location of your Storybook project relative to the Git repository root.
 */

export async function main([statsFile, ...inputFiles]) {
  const stats = await fs.readJson(statsFile);
  const ctx = {
    log: console,
    options: {
      storybookBaseDir: process.env.STORYBOOK_BASE_DIR || '.',
    },
    storybook: {
      configDir: process.env.STORYBOOK_CONFIG_DIR || '.storybook',
      staticDir: ['static'],
    },
    turboSnap: {},
  };

  try {
    const changedFiles = inputFiles.map((file) => file.replace(/^\.\//, ''));
    const onlyStoryFiles = await getDependentStoryFiles(ctx, stats, statsFile, changedFiles);

    ctx.log.info(`Found ${ctx.turboSnap.globs.length} CSF globs`);
    ctx.log.info(`Found ${ctx.turboSnap.modules.length} user modules`);

    if (onlyStoryFiles) {
      const files = Object.values(onlyStoryFiles);
      ctx.log.info(`Found ${files.length} dependent story files:`);
      files.forEach((file) => ctx.log.info(`- ${file}`));
    }
  } catch (e) {
    ctx.log.info(getDiagnostics(ctx));
  }
}
