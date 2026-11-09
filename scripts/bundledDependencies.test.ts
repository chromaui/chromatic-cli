import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { compare, inventory } from './bundledDependencies.mjs';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'bundled-dependencies-'));
  roots.push(root);
  function json(filePath: string, value: unknown) {
    const file = path.join(root, filePath);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(value));
  }
  json('node_modules/dotenv/package.json', { name: 'dotenv', version: '16.6.1' });
  json('node_modules/parent/node_modules/dotenv/package.json', {
    name: 'dotenv',
    version: '8.6.0',
  });
  json('node_modules/@scope/pkg/package.json', { name: '@scope/pkg', version: '2.0.0' });
  json('node_modules/unused/package.json', { name: 'unused', version: '9.0.0' });
  json('dist/cli.cjs.map', {
    sources: ['../bin-src/register.js', '../node_modules/dotenv/config.js'],
  });
  json('dist/chunk.cjs.map', {
    sourceRoot: '..',
    sources: [
      'node_modules/@scope/pkg/index.js',
      'node_modules/parent/node_modules/dotenv/lib/main.js',
      'node_modules/dotenv/lib/main.js',
    ],
  });
  json('action/register.cjs.map', { sources: ['../node_modules/@scope/pkg/index.js'] });
  return { root, json };
}

it('reports only emitted packages, retaining nested versions and separating build targets', () => {
  const { root } = fixture();
  expect(inventory(root)).toEqual({
    dist: { '@scope/pkg': ['2.0.0'], dotenv: ['8.6.0', '16.6.1'] },
    action: { '@scope/pkg': ['2.0.0'] },
  });
});

it('fails instead of reporting no changes when source maps or package identities are missing', () => {
  const { root, json } = fixture();
  rmSync(path.join(root, 'action/register.cjs.map'));
  expect(() => inventory(root)).toThrow('No source maps');
  json('action/register.cjs.map', { sources: ['../node_modules/missing/index.js'] });
  expect(() => inventory(root)).toThrow('ENOENT');
});

it('shows downgrades, additions, removals, and multiple versions in the review report', () => {
  expect(
    compare(
      { dist: { dotenv: ['16.6.1'], removed: ['1.0.0'], shared: ['2.0.0'] }, action: {} },
      { dist: { dotenv: ['8.6.0'], added: ['3.0.0'], shared: ['2.0.0', '4.0.0'] }, action: {} }
    )
  ).toBe(`### Bundled dependency changes

Versions from emitted source maps; external dependencies are not included.

#### CLI / Node API

| Package | Base | PR |
| --- | --- | --- |
| added | — | 3.0.0 |
| dotenv | 16.6.1 | 8.6.0 |
| removed | 1.0.0 | — |
| shared | 2.0.0 | 2.0.0, 4.0.0 |

#### GitHub Action

No bundled dependency changes.
`);
});
