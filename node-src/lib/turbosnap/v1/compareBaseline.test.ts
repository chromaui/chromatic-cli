import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

import TestLogger from '../../testLogger';
import { compareBaseline } from './compareBaseline';
import { getDependencies } from './getDependencies';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const getContext: any = (baselineCommits: string[]) => ({
  log: new TestLogger(),
  git: { baselineCommits },
});

async function getMockedDependencies(headName: string, baseName: string, lockfile = 'yarn.lock') {
  const ctx = getContext();
  return {
    head: await getDependencies(ctx, {
      rootPath: path.join(__dirname, `../../../__mocks__/dependencyChanges/${headName}`),
      manifestPath: 'package.json',
      lockfilePath: lockfile,
    }),
    base: await getDependencies(ctx, {
      rootPath: path.join(__dirname, `../../../__mocks__/dependencyChanges/${baseName}`),
      manifestPath: 'package.json',
      lockfilePath: lockfile,
    }),
  };
}

describe('compareBaseline', () => {
  it('finds changed dependency names', async () => {
    const { head, base } = await getMockedDependencies('react-async-10', 'react-async-9');
    const baselineChanges = await compareBaseline(head, base);

    expect(baselineChanges).toEqual(new Set(['react-async']));
  });

  it('finds added dependency names', async () => {
    const { head, base } = await getMockedDependencies('react-async-9', 'plain');
    const baselineChanges = await compareBaseline(head, base);

    expect(baselineChanges).toEqual(new Set(['react-async']));
  });

  it('finds removed dependency names', async () => {
    const { head, base } = await getMockedDependencies('plain', 'react-async-9');
    const baselineChanges = await compareBaseline(head, base);

    expect(baselineChanges).toEqual(new Set(['react-async']));
  });

  it('finds nothing given identical files', async () => {
    const { head, base } = await getMockedDependencies('plain', 'plain');
    const baselineChanges = await compareBaseline(head, base);

    expect(baselineChanges).toEqual(new Set());
  });

  it('runs the manifest check on yarn berry lock files successfully', async () => {
    const { head, base } = await getMockedDependencies('berry', 'berry');
    const baselineChanges = await compareBaseline(head, base);

    expect(baselineChanges).toEqual(new Set());
  });

  it('does not find yarn berry changed dependency name for set resolution', async () => {
    const { head, base } = await getMockedDependencies('berry', 'berry-chalk');
    const baselineChanges = await compareBaseline(head, base);

    expect(baselineChanges).toEqual(new Set(['husky']));
  });

  // Regression test for pnpm catalogs: bumping a catalog-pinned version only changes
  // pnpm-lock.yaml (the `catalogs:` and `importers:` entries) -- package.json keeps the
  // `catalog:` specifier unchanged. Fixtures were generated with a real `pnpm install
  // --lockfile-only` after editing pnpm-workspace.yaml's catalog, not hand-written, so this
  // exercises the real snyk pnpm lockfile parser against a real catalog-format lockfile.
  it('finds changed dependency names for a pnpm catalog version bump', async () => {
    const { head, base } = await getMockedDependencies(
      'pnpm-catalog-after',
      'pnpm-catalog-before',
      'pnpm-lock.yaml'
    );
    const baselineChanges = await compareBaseline(head, base);

    expect(baselineChanges).toEqual(new Set(['is-odd', 'is-number']));
  });
});
