#!/usr/bin/env node

// Copies a fixture out of this repository and installs it there. The copy gets its own git
// history, because inside this repository TurboSnap would diff the CLI's commits instead.

import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { $ } from 'execa';

const fixturesDirectory = fileURLToPath(new URL('fixtures', import.meta.url));
const cliBin = fileURLToPath(new URL('../dist/bin.cjs', import.meta.url));

async function main([fixture, destination]) {
  const fixtures = listFixtures();
  if (!fixtures.includes(fixture)) {
    console.error('Usage: yarn fixture <fixture> [destination]');
    console.error(`Fixtures: ${fixtures.join(', ')}`);
    process.exit(1);
  }

  const target = destination
    ? createEmptyDirectory(path.resolve(process.env.INIT_CWD ?? process.cwd(), destination))
    : mkdtempSync(path.join(tmpdir(), `chromatic-${fixture}-`));

  await copyFixture(path.join(fixturesDirectory, fixture), target);
  await commitAll(target);
  await install(target);

  console.info(`\n✅ Prepared ${fixture} in ${target}`);
  console.info(`Run the CLI from one of its Storybook projects (see e2e/README.md) with:`);
  console.info(
    `  node ${cliBin} --project-token <token> --build-script-name build-storybook --only-changed`
  );
  if (!existsSync(cliBin)) {
    console.info('The CLI is not built yet. Run `yarn build` in this repository first.');
  }
}

function listFixtures() {
  return readdirSync(fixturesDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function createEmptyDirectory(directory) {
  if (existsSync(directory) && readdirSync(directory).length > 0) {
    console.error(`❗️ ${directory} is not empty`);
    process.exit(1);
  }
  mkdirSync(directory, { recursive: true });
  return directory;
}

// Copies what git would commit, so local installs and build output inside the fixture stay behind.
async function copyFixture(source, target) {
  const { stdout } = await $({
    cwd: source,
  })`git ls-files -z --cached --others --exclude-standard`;
  const files = stdout.split('\0').filter((file) => file && existsSync(path.join(source, file)));
  for (const file of files) {
    cpSync(path.join(source, file), path.join(target, file));
  }
}

async function commitAll(directory) {
  const git = $({ cwd: directory });
  await git`git init --quiet --initial-branch=main`;
  await git`git add --all`;
  // The user's global config could sign the commit or run their hooks.
  await git`git -c user.name=Fixture -c user.email=fixture@example.com -c commit.gpgsign=false -c core.hooksPath=/dev/null commit --quiet -m ${'Initial fixture'}`;
}

async function install(directory) {
  const { packageManager = 'npm' } = JSON.parse(
    readFileSync(path.join(directory, 'package.json'), 'utf8')
  );
  const [command, ...args] = installCommand(packageManager);
  console.info(`📦 ${command} ${args.join(' ')}`);
  await $({ cwd: directory, stdio: 'inherit' })`${command} ${args}`;
}

function installCommand(packageManager) {
  const [name, version] = packageManager.split('+')[0].split('@');
  switch (name) {
    case 'yarn':
      return version.startsWith('1.')
        ? ['corepack', 'yarn', 'install', '--frozen-lockfile']
        : ['corepack', 'yarn', 'install', '--immutable'];
    case 'pnpm':
      // Corepack can't launch pnpm 12, which ships as a native binary.
      return ['npx', '--yes', `pnpm@${version}`, 'install', '--frozen-lockfile'];
    default:
      return ['npm', 'ci'];
  }
}

await main(process.argv.slice(2));
