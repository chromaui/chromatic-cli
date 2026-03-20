#!/usr/bin/env node

import cpy from 'cpy';
import { $ } from 'execa';
import { readFileSync } from 'fs';
import tmp from 'tmp-promise';

const copy = (globs, ...args) => {
  console.info(`📦 Copying:\n   - ${globs.join('\n   - ')}`);
  return cpy(globs, ...args);
};

const publishAction = async ({ major, version, repo }) => {
  const dryRun = process.argv.includes('--dry-run');

  console.info(`🚀 Publishing ${version} to ${repo} ${dryRun ? '(dry run)' : ''}`);

  const { path, cleanup } = await tmp.dir({ unsafeCleanup: true, prefix: `chromatic-action-` });

  await $`git clone https://${process.env.GH_TOKEN}@github.com/${repo}.git ${path}`;

  await $`yarn clean-package`;
  await copy(['action/*.js', 'action/*.json', 'action.yml', 'package.json', 'CHANGELOG.md'], path, {
    parents: true, // keep directory structure (i.e. action dir)
    overwrite: true,
  });
  await copy(['action-src/LICENSE', 'action-src/README.md'], path, {
    overwrite: true,
  });
  await $`yarn clean-package restore`;

  const $$ = (strings, ...args) => {
    console.info(
      // eslint-disable-next-line unicorn/no-array-reduce
      strings.reduce((accumulator, s, index) => `${accumulator}${s}${args[index] || ''}`, '🏃 ')
    );
    return $({ cwd: path })(strings, ...args);
  };

  await $$`git config user.name Chromatic`;
  await $$`git config user.email support@chromatic.com`;
  await $$`git add .`;
  await $$`git commit -m v${version}`;

  if (dryRun) {
    console.info('✅ Skipping git push due to --dry-run');
  } else {
    await $$`git tag -a v${version} -m ${`v${version} without automatic upgrades (pinned)`}`;
    await $$`git tag -f -a v${major} -m ${`v${version} with automatic upgrades to v${major}.x.x`}`;
    await $$`git tag -f -a latest -m ${`v${version} with automatic upgrades to all versions`}`;
    await $$`git push origin HEAD:main`;
    await $$`git push --tags --force`;
    console.info('✅ Done');
  }

  return cleanup();
};

export async function main(context) {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  let version = pkg.version;
  if (context === 'canary') {
    const { stdout: sha } = await $`git rev-parse --short HEAD`;
    version += '-' + sha.trim();
  }
  console.info(`📌 Using context arg: ${context}`);
  console.info(`📌 Using package.json version: ${version}`);

  const [, major, minor, patch] = version.match(/^(\d+)\.(\d+)\.(\d+)-*(\w+)?/) || [];
  if (!major || !minor || !patch) {
    console.error(`❗️ Invalid version: ${version}`);
    return;
  }

  switch (context) {
    case 'canary':
      await publishAction({ major, version, repo: 'chromaui/action-canary' });
      break;
    case 'next':
      await publishAction({ major, version, repo: 'chromaui/action-next' });
      break;
    case 'latest':
      await publishAction({ major, version, repo: 'chromaui/action' });
      break;
    default:
      console.error(`❗️ Unknown context: ${context}`);
  }
}

/**
 * For manual (local) use:
 *   yarn publish-action {context} [--dry-run]
 *   e.g. yarn publish-action canary
 *   or   yarn publish-action latest --dry-run
 *
 * Make sure to build the action before publishing manually.
 */

if (process.argv[1] === import.meta.filename) {
  if (process.env.GH_TOKEN === undefined) {
    console.error(
      `❗️ GH_TOKEN environment variable is required to publish the action. Please set it and try again.`
    );
    process.exit(1);
  }

  const { stdout: status } = await $`git status --porcelain`;
  if (status) {
    console.error(`❗️ Working directory is not clean:\n${status}`);
    process.exit(1);
  }

  // eslint-disable-next-line unicorn/prefer-top-level-await
  main(process.argv[2]);
}
