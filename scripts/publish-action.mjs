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

  await copy(['action/*.js', 'action/*.json', 'action.yml', 'package.json'], path, {
    parents: true, // keep directory structure (i.e. action dir)
  });
  await copy(['action-src/CHANGELOG.md', 'action-src/LICENSE', 'action-src/README.md'], path);

  const $$ = (strings, ...args) => {
    console.info(strings.reduce((acc, s, i) => `${acc}${s}${args[i] || ''}`, '🏃 '));
    return $({ cwd: path })(strings, ...args);
  };

  await $$`git init -b main`;
  await $$`git config user.name Chromatic`;
  await $$`git config user.email support@chromatic.com`;
  await $$`git remote add origin https://${process.env.GH_TOKEN}@github.com/${repo}.git`;
  await $$`git add .`;
  await $$`git commit -m v${version}`;
  await $$`git tag -a v${version} -m ${`v${version} without automatic upgrades (pinned)`}`;
  await $$`git tag -a v${major} -m ${`v${version} with automatic upgrades to v${major}.x.x`}`;
  await $$`git tag -a v1 -m ${`Deprecated, use 'latest' tag instead`}`;
  await $$`git tag -a latest -m ${`v${version} with automatic upgrades to all versions`}`;

  if (dryRun) {
    console.info('✅ Skipping git push due to --dry-run');
  } else {
    await $$`git push origin HEAD:main --force`;
    await $$`git push --tags --force`;
    console.info('✅ Done');
  }

  return cleanup();
};

/**
 * Generally, this script is invoked by auto's `afterShipIt` hook.
 *
 * For manual (local) use:
 *   yarn publish-action {context} [--dry-run]
 *   e.g. yarn publish-action canary
 *   or   yarn publish-action latest --dry-run
 *
 * Make sure to build the action before publishing manually.
 */
(async () => {
  const { stdout: status } = await $`git status --porcelain`;
  if (status) {
    console.error(`❗️ Working directory is not clean:\n${status}`);
    return;
  }

  let context, version;
  if (['canary', 'next', 'latest'].includes(process.argv[2])) {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    context = process.argv[2];
    version = pkg.version;
    console.info(`📌 Using context arg: ${context}`);
    console.info(`📌 Using package.json version: ${version}`);
  } else {
    const data = JSON.parse(process.env.ARG_0);
    context = data.context;
    version = data.newVersion.replace(/^v/, '');
    console.info(`📌 Using auto shipIt context: ${context}`);
    console.info(`📌 Using auto shipIt version: ${version}`);
    console.info(`Commits in release:`);
    data.commitsInRelease.forEach((c) => console.info(`- ${c.hash.slice(0, 8)} ${c.subject}`));
  }

  const [, major, minor, patch] = version.match(/^(\d+)\.(\d+)\.(\d+)-*(\w+)?/) || [];
  if (!major || !minor || !patch) {
    console.error(`❗️ Invalid version: ${version}`);
    return;
  }

  switch (context) {
    case 'canary':
      if (process.argv[2] !== 'canary') {
        console.info('Skipping automatic publish of action-canary.');
        console.info('Run `yarn publish-action canary` to publish a canary action.');
        return;
      }
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
})();
