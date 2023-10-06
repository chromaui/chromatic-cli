#!/usr/bin/env node

import cpy from 'cpy';
import { execaCommand } from 'execa';
import tmp from 'tmp-promise';

const command = (cmd, opts) => execaCommand(cmd, { stdio: 'inherit', ...opts });

const publishAction = async ({ version, repo }) => {
  const dryRun = process.argv.includes('--dry-run');

  console.info(`✅ Publishing ${version} to ${repo} ${dryRun ? '(dry run)' : ''}`);

  const { path, cleanup } = await tmp.dir({ unsafeCleanup: true, prefix: `chromatic-action-` });
  const run = (cmd) => command(cmd, { cwd: path });

  await cpy(['action/*.js', 'action/*.json', 'action.yml', 'package.json'], path, {
    parents: true,
  });
  await cpy(['action-src/CHANGELOG.md', 'action-src/LICENSE', 'action-src/README.md'], path);

  await run('git init -b main');
  await run(`git remote add origin https://${process.env.GH_TOKEN}@github.com/${repo}.git`);
  await run('git add .');
  await run(`git commit -m ${version}`);
  await run('git tag -f v1'); // For backwards compatibility
  await run('git tag -f latest');

  if (dryRun) {
    console.info('✅ Skipping git push due to --dry-run');
  } else {
    await run('git push origin HEAD:main --force');
    await run('git push --tags --force');
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
  const { stdout: status } = await execaCommand('git status --porcelain');
  if (status) {
    console.error(`❗️ Working directory is not clean:\n${status}`);
    return;
  }

  const { default: pkg } = await import('../package.json', { assert: { type: 'json' } });

  const [, major, minor, patch, tag] = pkg.version.match(/(\d+)\.(\d+)\.(\d+)-?(\w+)?/) || [];
  if (!major || !minor || !patch) {
    console.error(`❗️ Invalid version: ${pkg.version}`);
    return;
  }

  const context = ['canary', 'next', 'latest'].includes(process.argv[2])
    ? process.argv[2]
    : tag || 'latest';

  switch (context) {
    case 'canary':
      if (process.argv[2] !== 'canary') {
        console.info('Skipping automatic publish of action-canary.');
        console.info('Run `yarn publish-action canary` to publish a canary action.');
        return;
      }
      await publishAction({ version: pkg.version, repo: 'chromaui/action-canary' });
      break;
    case 'next':
      await publishAction({ version: pkg.version, repo: 'chromaui/action-next' });
      break;
    case 'latest':
      await publishAction({ version: pkg.version, repo: 'chromaui/action' });
      break;
    default:
      console.error(`❗️ Unknown tag: ${tag}`);
  }
})();
