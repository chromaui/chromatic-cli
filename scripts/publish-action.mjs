#!/usr/bin/env node

import cpy from 'cpy';
import { execaCommand } from 'execa';
import tmp from 'tmp-promise';

const command = (cmd, opts) => execaCommand(cmd, { stdio: 'inherit', ...opts });

const publishAction = async ({ repo, tag, version }) => {
  console.info(`✅ Publishing '${tag}' action to https://github.com/${repo}`);

  const { path, cleanup } = await tmp.dir({ unsafeCleanup: true, prefix: `chromatic-action-` });
  const run = (cmd) => command(cmd, { cwd: path });

  await cpy(['action/*.js', 'action/*.json', 'action.yml', 'package.json'], path, {
    parents: true,
  });
  await cpy(['action-src/CHANGELOG.md', 'action-src/LICENSE', 'action-src/README.md'], path);

  await run('git init -b main');
  await run(`git remote add origin git@github.com:${repo}.git`);
  await run('git add .');
  await run(`git commit -m ${version}`);
  await run('git tag v1');
  await run('git push origin head --force');
  await run('git push --tags --force');

  return cleanup();
};

/**
 * Usage:
 *  release <major | minor | patch> <canary | next | latest> [--dry-run]
 *  release action <canary | next | latest> [--dry-run]
 */
(async () => {
  console.log(JSON.parse(process.env.ARG_0));
  return;

  // if (tag === 'canary') {
  //   await publishAction({ repo: 'chromaui/action-canary', tag, version });
  // } else if (tag === 'next') {
  //   await publishAction({ repo: 'chromaui/action-next', tag, version });
  // } else {
  //   await publishAction({ repo: 'chromaui/action-next', tag, version });
  //   await publishAction({ repo: 'chromaui/action', tag, version });
  // }

  // if (tag === 'latest' && bump !== 'action') {
  //   const tagCommand = `npm dist-tag add chromatic@${version} next`;
  //   console.log(`⚠️ Don't forget to update the 'next' tag by running:\n  ${tagCommand}`);
  // }
})();
