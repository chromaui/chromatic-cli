import cpy from 'cpy';
import { execaCommand } from 'execa';
import fsExtra from 'fs-extra';
import { join } from 'path';
import tmp from 'tmp-promise';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const { readJson } = fsExtra;
const __dirname = dirname(fileURLToPath(import.meta.url));

const command = (cmd, opts) => execaCommand(cmd, { stdio: 'inherit', ...opts });

const bumpVersion = async ({ bump, tag, currentTag, dryRun }) => {
  if (dryRun) {
    console.log(`✅ Skipping ${bump} version bump due to --dry-run`);
    return;
  }
  if (tag === 'latest') {
    console.log(`✅ Bumping ${bump} version`);
    await command(`npm version ${bump}`);
  } else if (tag === currentTag) {
    console.log(`✅ Incrementing ${tag} prerelease version`);
    await command(`npm version prerelease --preid=${tag}`);
  } else if (tag === 'next' && currentTag === 'canary') {
    console.log(`✅ Promoting canary prerelease version to next`);
    await command(`npm version prerelease --preid=${tag}`);
  } else {
    console.log(`✅ Creating ${bump} ${tag} prerelease version`);
    await command(`npm version pre${bump} --preid=${tag}`);
  }
};
const publishPackage = async ({ tag, dryRun }) => {
  const { version } = await readJson(join(__dirname, '../package.json'));
  const dry = dryRun ? '--dry-run' : '';
  console.log(`✅ Publishing ${tag} version ${version} ${dry && `(${dry})`}`);
  await command(`npm publish --tag ${tag} ${dry}`);
  if (!dryRun) {
    await command(`git push --follow-tags`);
  }
};

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
  const [bump, tag, ...rest] = process.argv.slice(2);
  const dryRun = rest.includes('--dry-run');

  if (!['patch', 'minor', 'major', 'action'].includes(bump)) {
    throw new Error("Invalid bump, expecting one of 'patch', 'minor', 'major'");
  }
  if (!['canary', 'next', 'latest'].includes(tag)) {
    throw new Error("Invalid tag, expecting one of 'canary', 'next', 'latest'");
  }

  if (bump === 'action') {
    // We need to build the action manually if we're not publishing to npm
    await command('npm run bundle:action');
  } else {
    const { version: currentVersion } = await readJson(join(__dirname, '../package.json'));
    const [, , , currentTag] = currentVersion.match(/^([0-9]+\.[0-9]+\.[0-9]+)(-(\w+)\.\d+)?$/);

    await bumpVersion({ bump, tag, currentTag, dryRun });
    await publishPackage({ tag, dryRun });
  }

  // Get the version we bumped to (or whichever is current, if we're only publishing the action)
  const { version } = await readJson(join(__dirname, '../package.json'));

  if (dryRun) {
    console.log(`✅ Not publishing action due to --dry-run`);
    console.log(`Running without --dry-run would publish ${version} as ${tag} action`);
    if (tag === 'latest') console.log(`This would also update action-next to ${version}`);
    return;
  }

  if (tag === 'canary') {
    await publishAction({ repo: 'chromaui/action-canary', tag, version });
  } else if (tag === 'next') {
    await publishAction({ repo: 'chromaui/action-next', tag, version });
  } else {
    await publishAction({ repo: 'chromaui/action-next', tag, version });
    await publishAction({ repo: 'chromaui/action', tag, version });
  }

  if (tag === 'latest' && bump !== 'action') {
    const tagCommand = `npm dist-tag add chromatic@${version} next`;
    console.log(`⚠️ Don't forget to update the 'next' tag by running:\n  ${tagCommand}`);
  }
})();
