import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

import TestLogger from '../testLogger';
import { compareBaseline } from './compareBaseline';
import { getDependencies } from './getDependencies';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const getContext: any = (baselineCommits: string[]) => ({
  log: new TestLogger(),
  git: { baselineCommits },
});

async function getMockedDependencies(ctx, headName, baseName) {
  return {
    headDependencies: await getDependencies(ctx, {
      rootPath: path.join(__dirname, `../../__mocks__/dependencyChanges/${headName}`),
      manifestPath: 'package.json',
      lockfilePath: 'yarn.lock',
    }),
    baseDependencies: await getDependencies(ctx, {
      rootPath: path.join(__dirname, `../../__mocks__/dependencyChanges/${baseName}`),
      manifestPath: 'package.json',
      lockfilePath: 'yarn.lock',
    }),
  };
}

describe('compareBaseline', () => {
  it('finds changed dependency names', async () => {
    const { headDependencies, baseDependencies } = await getMockedDependencies(
      getContext(),
      'react-async-10',
      'react-async-9'
    );
    const baselineChanges = await compareBaseline(headDependencies, baseDependencies);

    expect(baselineChanges).toEqual(new Set(['react-async']));
  });

  it('finds added dependency names', async () => {
    const { headDependencies, baseDependencies } = await getMockedDependencies(
      getContext(),
      'react-async-9',
      'plain'
    );
    const baselineChanges = await compareBaseline(headDependencies, baseDependencies);

    expect(baselineChanges).toEqual(new Set(['react-async']));
  });

  it('finds removed dependency names', async () => {
    const { headDependencies, baseDependencies } = await getMockedDependencies(
      getContext(),
      'plain',
      'react-async-9'
    );
    const baselineChanges = await compareBaseline(headDependencies, baseDependencies);

    expect(baselineChanges).toEqual(new Set(['react-async']));
  });

  it('finds nothing given identical files', async () => {
    const { headDependencies, baseDependencies } = await getMockedDependencies(
      getContext(),
      'plain',
      'plain'
    );
    const baselineChanges = await compareBaseline(headDependencies, baseDependencies);

    expect(baselineChanges).toEqual(new Set());
  });

  it('runs the manifest check on yarn berry lock files successfully', async () => {
    const { headDependencies, baseDependencies } = await getMockedDependencies(
      getContext(),
      'berry',
      'berry'
    );
    const baselineChanges = await compareBaseline(headDependencies, baseDependencies);

    expect(baselineChanges).toEqual(new Set());
  });

  it('does not find yarn berry changed dependency name for set resolution', async () => {
    const { headDependencies, baseDependencies } = await getMockedDependencies(
      getContext(),
      'berry',
      'berry-chalk'
    );
    const baselineChanges = await compareBaseline(headDependencies, baseDependencies);

    expect(baselineChanges).toEqual(new Set(['husky']));
  });
});
