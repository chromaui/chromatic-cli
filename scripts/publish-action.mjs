#!/usr/bin/env node

import cpy from 'cpy';
import { execa } from 'execa';
import tmp from 'tmp-promise';

const git = (args, opts) => execa('git', args, { stdio: 'inherit', ...opts });

const publishAction = async ({ major, version, repo }) => {
  const dryRun = process.argv.includes('--dry-run');

  console.info(`✅ Publishing ${version} to ${repo} ${dryRun ? '(dry run)' : ''}`);

  const { path, cleanup } = await tmp.dir({ unsafeCleanup: true, prefix: `chromatic-action-` });
  const run = (...args) => {
    if (dryRun) console.log(`👉 git ${args.join(' ')}`);
    return git(args, { stdio: 'inherit', cwd: path });
  };

  await cpy(['action/*.js', 'action/*.json', 'action.yml', 'package.json'], path, {
    parents: true,
  });
  await cpy(['action-src/CHANGELOG.md', 'action-src/LICENSE', 'action-src/README.md'], path);

  await run('init', '-b', 'main');
  await run('config', 'user.name', 'Chromatic');
  await run('config', 'user.email', 'support@chromatic.com');
  await run('remote', 'add', 'origin', `https://${process.env.GH_TOKEN}@github.com/${repo}.git`);
  await run('add', '.');
  await run('commit', '-m', `v${version}`);
  await run('tag', '-a', `v${version}`, '-m', `v${version} without automatic upgrades (pinned)`);
  await run('tag', '-a', `v${major}`, '-m', `v${version} with automatic upgrades to v${major}.x.x`);
  await run('tag', '-a', 'v1', '-m', `Deprecated, use 'latest' tag instead`);
  await run('tag', '-a', 'latest', '-m', `v${version} with automatic upgrades to all versions`);

  if (dryRun) {
    console.info('✅ Skipping git push due to --dry-run');
  } else {
    await run('push', 'origin', 'HEAD:main', '--force');
    await run('push', '--tags', '--force');
  }

  return cleanup();
};

/**
 * Generally, this script is invoked by auto's `afterShipIt` hook.
 *
 * For manual (local) use:
 *   yarn publish-action [context] [--dry-run]
 *   e.g. yarn publish-action canary
 *   or   yarn publish-action --dry-run
 *
 * Make sure to build the action before publishing manually.
 */
(async () => {
  const { stdout: status } = await git(['status', '--porcelain']);
  if (status) {
    console.error(`❗️ Working directory is not clean:\n${status}`);
    return;
  }

  const { default: pkg } = await import('../package.json', { assert: { type: 'json' } });

  const [, major, minor, patch, tag] = pkg.version.match(/(\d+)\.(\d+)\.(\d+)-*(\w+)?/) || [];
  if (!major || !minor || !patch) {
    console.error(`❗️ Invalid version: ${pkg.version}`);
    return;
  }

  const { stdout: branch } = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const defaultTag = branch === 'main' ? 'latest' : 'canary';
  const context = ['canary', 'next', 'latest'].includes(process.argv[2])
    ? process.argv[2]
    : tag || defaultTag;

  switch (context) {
    case 'canary':
      if (process.argv[2] !== 'canary') {
        console.info('Skipping automatic publish of action-canary.');
        console.info('Run `yarn publish-action canary` to publish a canary action.');
        return;
      }
      await publishAction({ major, version: pkg.version, repo: 'chromaui/action-canary' });
      break;
    case 'next':
      await publishAction({ major, version: pkg.version, repo: 'chromaui/action-next' });
      break;
    case 'latest':
      await publishAction({ major, version: pkg.version, repo: 'chromaui/action' });
      break;
    default:
      console.error(`❗️ Unknown tag: ${tag}`);
  }
})();
