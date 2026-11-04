#!/usr/bin/env node

// Fails when a fixture mixes Storybook versions. Every `@storybook/*` package from Storybook's own
// repository must be on the same version as the fixture's `storybook`, both where package.json
// pins it and where the lockfile resolves it. The lockfile matters because a fixture can pull a
// Storybook package in without pinning it, as `react-rsbuild` does with `@storybook/react`.
// Versions only have to match within a fixture; fixtures can be on different Storybook versions.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixturesDirectory = fileURLToPath(new URL('fixtures', import.meta.url));

// `@storybook/*` packages released outside Storybook's repository, on their own version numbers.
const independentlyVersioned = new Set([
  '@storybook/addon-webpack5-compiler-swc',
  '@storybook/global',
  '@storybook/icons',
  '@storybook/react-docgen-typescript-plugin',
]);

function isStorybookPackage(name) {
  return (
    name === 'storybook' || (name.startsWith('@storybook/') && !independentlyVersioned.has(name))
  );
}

function main() {
  const fixtures = readdirSync(fixturesDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const failures = fixtures.flatMap((fixture) => {
    const problem = checkFixture(path.join(fixturesDirectory, fixture));
    return problem ? [`❌ e2e/fixtures/${fixture} ${problem}`] : [];
  });

  if (failures.length === 0) {
    console.info(
      `✅ Storybook packages match \`storybook\` in every fixture (${fixtures.join(', ')})`
    );
    return;
  }

  console.error(failures.join('\n\n'));
  console.error(
    [
      '',
      'Update the packages above to the version of `storybook` in the same fixture, then update its lockfile.',
      'See "Changing a fixture" in e2e/README.md for how to update a lockfile.',
      'If a package is released separately from Storybook, add it to `independentlyVersioned` in e2e/check-storybook-versions.mjs.',
    ].join('\n')
  );
  process.exitCode = 1;
}

// Returns a description of the fixture's mismatched packages, or nothing when they all match.
function checkFixture(directory) {
  const found = [...readPins(directory), ...readLockfile(directory)].filter(({ name }) =>
    isStorybookPackage(name)
  );
  const expected = found.find(
    ({ name, source }) => name === 'storybook' && source.endsWith('package.json')
  )?.version;
  if (!expected) return 'does not pin `storybook` in any package.json';

  const mismatched = found.filter(({ version }) => version !== expected);
  if (mismatched.length === 0) return undefined;

  const lines = mismatched.map(({ name, version, source }) => `  ${name}@${version} (${source})`);
  return [
    `mixes Storybook versions. \`storybook\` is ${expected}, but these are not:`,
    ...lines,
  ].join('\n');
}

function readPins(directory) {
  const workspaces = path.join(directory, 'packages');
  const manifests = [
    'package.json',
    ...(existsSync(workspaces)
      ? readdirSync(workspaces).map((workspace) => path.join('packages', workspace, 'package.json'))
      : []),
  ].filter((manifest) => existsSync(path.join(directory, manifest)));

  return manifests.flatMap((manifest) => {
    const json = JSON.parse(readFileSync(path.join(directory, manifest), 'utf8'));
    const pins = { ...json.peerDependencies, ...json.devDependencies, ...json.dependencies };
    return Object.entries(pins).map(([name, version]) => ({ name, version, source: manifest }));
  });
}

const lockfileParsers = {
  'package-lock.json': parseNpmLockfile,
  'yarn.lock': parseYarnLockfile,
  'pnpm-lock.yaml': parsePnpmLockfile,
};

function readLockfile(directory) {
  const lockfile = Object.keys(lockfileParsers).find((name) =>
    existsSync(path.join(directory, name))
  );
  if (!lockfile) throw new Error(`${directory} has no lockfile`);

  const resolved = lockfileParsers[lockfile](readFileSync(path.join(directory, lockfile), 'utf8'));
  // A lockfile that resolves no `storybook` means this parser no longer understands its format.
  if (!resolved.some(({ name }) => name === 'storybook')) {
    throw new Error(`Found no \`storybook\` in ${path.join(directory, lockfile)}`);
  }
  return resolved.map(({ name, version }) => ({ name, version, source: lockfile }));
}

// `"packages": { "node_modules/a/node_modules/@scope/b": { "version": "1.0.0" } }`
function parseNpmLockfile(contents) {
  return Object.entries(JSON.parse(contents).packages)
    .filter(([key]) => key.includes('node_modules/'))
    .map(([key, { version }]) => ({
      name: key.slice(key.lastIndexOf('node_modules/') + 13),
      version,
    }));
}

// Yarn 1 and Yarn 4 both put each package at the start of a line, with its version on a
// following indented line:
//   "@scope/b@npm:^1.0.0, @scope/b@npm:1.0.0":   (Yarn 1: "@scope/b@^1.0.0":)
//     version: 1.0.0                             (Yarn 1: version "1.0.0")
function parseYarnLockfile(contents) {
  const entries = [];
  let name;
  for (const line of contents.split('\n')) {
    if (/^\S.*:$/.test(line) && !line.startsWith('#')) {
      const descriptor = line.replace(/^"/, '');
      name = descriptor.slice(0, descriptor.indexOf('@', 1));
      continue;
    }
    const version = name && line.match(/^ {2}version:? "?([^"\s]+)"?$/)?.[1];
    if (version) {
      entries.push({ name, version });
      name = undefined;
    }
  }
  return entries;
}

// pnpm lists each resolved package under `packages:`, keyed by name and version. Recent pnpm versions
// write a second YAML document for pnpm itself, with its own `packages:`.
//   '@scope/b@1.0.0':
function parsePnpmLockfile(contents) {
  const sections = contents
    .split(/^packages:$/m)
    .slice(1)
    .map((rest) => rest.split(/^\S/m)[0]);
  return sections.flatMap((section) =>
    [...section.matchAll(/^ {2}'?((?:@[^@/]+\/)?[^@/'\s]+)@([^'\s]+)'?:$/gm)].map(
      ([, name, version]) => ({ name, version })
    )
  );
}

main();
