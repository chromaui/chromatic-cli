#!/usr/bin/env node

import cpy from 'cpy';
import { execaCommand } from 'execa';
import tmp from 'tmp-promise';

const command = (cmd, opts) => execaCommand(cmd, { stdio: 'inherit', ...opts });

const publishAction = async ({ context, newVersion, repo }) => {
  console.info(`✅ Publishing ${newVersion} as ${context} action to https://github.com/${repo}`);

  const [major, minor, patch] = newVersion.replace(/^(\d+\.\d+\.\d+).*/, '$1').split('.');
  if (!major || !minor || !patch) throw new Error(`Invalid version: ${newVersion}`);

  const { path, cleanup } = await tmp.dir({ unsafeCleanup: true, prefix: `chromatic-action-` });
  const run = (cmd) => command(cmd, { cwd: path });

  await cpy(['action/*.js', 'action/*.json', 'action.yml', 'package.json'], path, {
    parents: true,
  });
  await cpy(['action-src/CHANGELOG.md', 'action-src/LICENSE', 'action-src/README.md'], path);

  await run('git init -b main');
  await run(`git remote add origin https://${process.env.GH_TOKEN}@github.com/${repo}.git`);
  await run('git add .');
  await run(`git commit -m ${newVersion}`);
  await run('git tag -f v1'); // For backwards compatibility
  await run('git tag -f latest');
  await run('git push origin HEAD:main --force');
  await run('git push --tags --force');

  return cleanup();
};

/**
 * Generally, this script is invoked by auto's `afterShipIt` hook.
 *
 * For manual (local) use:
 *   yarn publish-action <context>
 *   e.g. yarn publish-action canary
 *
 * Make sure to build the action before publishing manually.
 */
(async () => {
  const { default: pkg } = await import('../package.json', { assert: { type: 'json' } });

  const { context, newVersion } = process.env.ARG_0
    ? JSON.parse(process.env.ARG_0)
    : { newVersion: pkg.version, context: process.argv[2] };

  switch (context) {
    case 'canary':
      if (process.env.ARG_0) {
        console.info('Skipping automatic publish of action-canary.');
        console.info('Run `yarn publish-action canary` to publish a canary action.');
      } else {
        await publishAction({ context, newVersion, repo: 'chromaui/action-canary' });
      }
      break;
    case 'next':
      await publishAction({ context, newVersion, repo: 'chromaui/action-next' });
      break;
    case 'latest':
      await publishAction({ context, newVersion, repo: 'chromaui/action-next' });
      await publishAction({ context, newVersion, repo: 'chromaui/action' });
      break;
    default:
      console.warn(`Unknown context: ${context}`);
  }
})();
