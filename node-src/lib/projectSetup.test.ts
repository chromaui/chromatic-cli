import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assertDependenciesReadable, detectProjectSetup, ProjectSetup } from './projectSetup';

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'project-setup-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function write(files: string[]) {
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), '');
  }
}

// The files each install was observed to write at a monorepo's root. Every manager also gives a
// workspace package its own node_modules with no marker, which the walk must go past.
const installs: [string, string[], (root: string) => ProjectSetup][] = [
  [
    'npm',
    ['node_modules/.package-lock.json'],
    (r) => ({ layout: 'node_modules', packageManager: 'npm', installRoot: r }),
  ],
  [
    'pnpm',
    ['node_modules/.modules.yaml'],
    (r) => ({ layout: 'node_modules', packageManager: 'pnpm', installRoot: r }),
  ],
  [
    "pnpm's nodeLinker: pnp, which keeps a working node_modules",
    ['.pnp.cjs', 'node_modules/.modules.yaml'],
    (r) => ({ layout: 'node_modules', packageManager: 'pnpm', installRoot: r }),
  ],
  [
    'Yarn 1',
    ['node_modules/.yarn-integrity'],
    (r) => ({ layout: 'node_modules', packageManager: 'yarn', installRoot: r }),
  ],
  [
    'Yarn 4 with the pnpm linker, which writes no .yarn-state.yml',
    ['.yarn/install-state.gz', 'node_modules/.store/pkg/package.json'],
    (r) => ({ layout: 'node_modules', packageManager: 'yarn', installRoot: r }),
  ],
  [
    "Yarn 4 Plug'n'Play",
    ['.pnp.cjs', '.yarn/install-state.gz'],
    (r) => ({
      layout: 'pnp',
      packageManager: 'yarn',
      installRoot: r,
      pnpFile: path.join(r, '.pnp.cjs'),
      pnpRuntime: 'inactive',
    }),
  ],
  [
    "Yarn Plug'n'Play with a committed cache (zero-installs), which has no install state",
    ['.pnp.cjs', '.yarn/cache/pkg.zip'],
    (r) => ({
      layout: 'pnp',
      packageManager: 'yarn',
      installRoot: r,
      pnpFile: path.join(r, '.pnp.cjs'),
      pnpRuntime: 'inactive',
    }),
  ],
  [
    'a committed .pnp.cjs that was never installed',
    ['.pnp.cjs', 'yarn.lock'],
    (r) => ({ layout: 'not-installed', packageManager: 'yarn', installRoot: r }),
  ],
  [
    'Bun with workspaces',
    ['node_modules/.bun/pkg/package.json'],
    (r) => ({ layout: 'node_modules', packageManager: 'bun', installRoot: r }),
  ],
  [
    'Bun without workspaces, which writes no marker',
    ['node_modules/pkg/package.json'],
    (r) => ({ layout: 'unknown', installRoot: path.join(r, 'packages/ui') }),
  ],
];

describe('detectProjectSetup', () => {
  it.each(installs)('detects %s from a workspace package', (_, files, expected) => {
    write([
      ...files,
      'packages/ui/node_modules/pkg/package.json',
      'packages/ui/.storybook/main.ts',
    ]);

    expect(detectProjectSetup(path.join(root, 'packages/ui/.storybook'))).toEqual(expected(root));
  });

  it('detects a checkout that was never installed, even with the cache a Storybook build leaves', () => {
    write([
      'package-lock.json',
      'packages/ui/node_modules/.cache/storybook/version',
      'packages/ui/.storybook/main.ts',
    ]);

    expect(detectProjectSetup(path.join(root, 'packages/ui/.storybook'))).toEqual({
      layout: 'not-installed',
    });
  });
});

describe('assertDependenciesReadable', () => {
  it("accepts a Plug'n'Play project only once its runtime is active", () => {
    const pnp = {
      layout: 'pnp' as const,
      packageManager: 'yarn' as const,
      installRoot: root,
      pnpFile: path.join(root, '.pnp.cjs'),
    };

    expect(() => assertDependenciesReadable({ ...pnp, pnpRuntime: 'inactive' }, root)).toThrow(
      'Run Chromatic through Yarn'
    );
    expect(() => assertDependenciesReadable({ ...pnp, pnpRuntime: 'active' }, root)).not.toThrow();
  });
});
