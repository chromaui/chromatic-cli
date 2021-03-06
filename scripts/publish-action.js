const cpy = require('cpy');
const execa = require('execa');
const { readJSON } = require('fs-extra');
const { join } = require('path');
const tmp = require('tmp-promise');

(async () => {
  const { version } = await readJSON(join(__dirname, '../package.json'));
  if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version)) {
    // eslint-disable-next-line no-console
    console.warn(`Not publishing action for ${version} because it's a prerelease`);
    return;
  }

  const { path, cleanup } = await tmp.dir({ unsafeCleanup: true, prefix: `chromatic-action-` });
  const run = (cmd, opts) => execa.command(cmd, { cwd: path, stdio: 'inherit', ...opts });

  await cpy(
    [
      'bin/**',
      '!bin/**/mocks',
      '!bin/**/*.test.js',
      '!bin/register.js',
      'action/main.js',
      'action/register.js',
      'action.yml',
      'package.json',
    ],
    path,
    { parents: true }
  );
  await cpy(['action/CHANGELOG.md', 'action/LICENSE', 'action/README.md'], path);

  await run('yarn install --production --no-lockfile');
  await run('git init');
  await run('git remote add origin git@github.com:chromaui/action.git');
  await run('git add .');
  await run(`git commit -m ${version}`);
  await run('git tag v1');
  await run('git push origin head --force');
  await run('git push --tags --force');

  cleanup();
})();
