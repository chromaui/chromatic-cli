/* eslint-disable no-console */

import chalk from 'chalk';
import fs from 'fs-extra';
import meow from 'meow';
import pluralize from 'pluralize';
import { getDependentStoryFiles, normalizePath } from './lib/getDependentStoryFiles';

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
    },
    turboSnap: {},
  };
  const stats = await fs.readJson(flags.statsFile);
  const changedFiles = input.map((f) => f.replace(/^\.\//, ''));

  await getDependentStoryFiles(ctx, stats, flags.statsFile, changedFiles);

  const { rootPath, workingDir } = ctx.turboSnap;
  const normalize = (posixPath) => normalizePath(posixPath, rootPath, workingDir);

  const printPath = (filepath) => {
    const { storybookBaseDir = '.' } = ctx.options;
    const result =
      storybookBaseDir === '.'
        ? filepath
        : filepath.replace(`${storybookBaseDir}/`, chalk.dim(`${storybookBaseDir}/`));
    return result
      .split('/')
      .map((part, index, parts) => {
        if (index < parts.length - 1) return part;
        const [, file, suffix = ''] = part.match(/^(.+?)( \+ \d+ modules)?$/);
        return chalk.bold(file) + (flags.expand ? chalk.magenta(suffix) : chalk.dim(suffix));
      })
      .join('/');
  };

  const modulesByName = stats.modules.reduce((acc, mod) =>
    Object.assign(acc, { [normalize(mod.name)]: mod })
  );
  const printModules = (moduleName, indent = '') => {
    if (!flags.expand) return '';
    const { modules } = modulesByName[moduleName] || {};
    return modules
      ? modules.reduce((acc, mod) => chalk`${acc}\n${indent}  ⎸  {dim ${normalize(mod.name)}}`, '')
      : '';
  };

  const traces = [...ctx.turboSnap.tracedPaths].map((path) => {
    const parts = path.split('\n');
    return parts
      .reduce((acc, part, index) => {
        if (index === 0) return chalk`— ${printPath(part)} {cyan [changed]}${printModules(part)}`;
        const indent = '  '.repeat(index);
        return chalk`${acc}\n${indent}∟ ${printPath(part)}${printModules(part, indent)}`;
      }, '')
      .concat(chalk`\n${'  '.repeat(parts.length)}∟ {cyan [story index]}`);
  });

  const changed = pluralize('changed files', changedFiles.length, true);
  const affected = pluralize('affected story files', traces.length, true);
  console.log(chalk`\nTraced {bold ${changed}} to {bold ${affected}}:\n`);

  console.log(traces.join('\n\n'));
}
