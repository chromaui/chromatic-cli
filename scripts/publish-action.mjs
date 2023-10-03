#!/usr/bin/env node

import cpy from 'cpy';
import { execaCommand } from 'execa';
import tmp from 'tmp-promise';

const command = (cmd, opts) => execaCommand(cmd, { stdio: 'inherit', ...opts });

const publishAction = async ({ context, newVersion, repo }) => {
  console.info(`✅ Publishing '${context}' action to https://github.com/${repo}`);

  const [major, minor, patch] = newVersion.replace(/^(\d+\.\d+\.\d+).*/, '$1').split('.');

  const { path, cleanup } = await tmp.dir({ unsafeCleanup: true, prefix: `chromatic-action-` });
  const run = (cmd) => command(cmd, { cwd: path });

  await cpy(['action/*.js', 'action/*.json', 'action.yml', 'package.json'], path, {
    parents: true,
  });
  await cpy(['action-src/CHANGELOG.md', 'action-src/LICENSE', 'action-src/README.md'], path);

  await run('git init -b main');
  await run('git config --global user.name "Chromatic"');
  await run('git config --global user.email "support@chromatic.com"');
  await run(`git remote add origin https://${process.env.GH_TOKEN}@github.com/${repo}.git`);
  await run('git add .');
  await run(`git commit -m "${newVersion}"`);
  await run('git tag v1');
  await run(`git tag v${major}.x.x`);
  await run(`git tag v${major}.${minor}.x`);
  await run(`git tag v${major}.${minor}.${patch}`);
  await run('git push origin HEAD:main --force');
  await run('git push --tags --force');

  return cleanup();
};

(async () => {
  const { context, newVersion } = JSON.parse(process.env.ARG_0);

  switch (context) {
    case 'canary':
      await publishAction({ context, newVersion, repo: 'chromaui/action-canary' });
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
