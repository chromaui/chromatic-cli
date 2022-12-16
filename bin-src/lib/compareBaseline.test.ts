import path from 'path';

import { compareBaseline } from './compareBaseline';
import { getDependencies } from './getDependencies';
import TestLogger from './testLogger';

const getContext: any = (baselineCommits: string[]) => ({
  log: new TestLogger(),
  git: { baselineCommits },
});

describe('compareBaseline', () => {
  it('finds changed dependency names', async () => {
    const ctx = getContext();
    const headDependencies = await getDependencies({
      rootPath: path.join(__dirname, '../__mocks__/dependencyChanges'),
      manifestPath: 'react-async-10-package.json',
      lockfilePath: 'react-async-10-yarn.lock',
    });
    const baselineChanges = await compareBaseline(ctx, headDependencies, {
      ref: 'A',
      rootPath: path.join(__dirname, '../__mocks__/dependencyChanges'),
      manifestPath: 'react-async-9-package.json',
      lockfilePath: 'react-async-9-yarn.lock',
    });

    expect(baselineChanges).toEqual(new Set(['react-async']));
  });

  it('finds added dependency names', async () => {
    const ctx = getContext();
    const headDependencies = await getDependencies({
      rootPath: path.join(__dirname, '../__mocks__/dependencyChanges'),
      manifestPath: 'react-async-9-package.json',
      lockfilePath: 'react-async-9-yarn.lock',
    });
    const baselineChanges = await compareBaseline(ctx, headDependencies, {
      ref: 'A',
      rootPath: path.join(__dirname, '../__mocks__/dependencyChanges'),
      manifestPath: 'plain-package.json',
      lockfilePath: 'plain-yarn.lock',
    });

    expect(baselineChanges).toEqual(new Set(['react-async']));
  });

  it('finds removed dependency names', async () => {
    const ctx = getContext();
    const headDependencies = await getDependencies({
      rootPath: path.join(__dirname, '../__mocks__/dependencyChanges'),
      manifestPath: 'plain-package.json',
      lockfilePath: 'plain-yarn.lock',
    });
    const baselineChanges = await compareBaseline(ctx, headDependencies, {
      ref: 'A',
      rootPath: path.join(__dirname, '../__mocks__/dependencyChanges'),
      manifestPath: 'react-async-9-package.json',
      lockfilePath: 'react-async-9-yarn.lock',
    });

    expect(baselineChanges).toEqual(new Set(['react-async']));
  });

  it('finds nothing given identical files', async () => {
    const ctx = getContext();
    const headDependencies = await getDependencies({
      rootPath: path.join(__dirname, '../__mocks__/dependencyChanges'),
      manifestPath: 'plain-package.json',
      lockfilePath: 'plain-yarn.lock',
    });
    const baselineChanges = await compareBaseline(ctx, headDependencies, {
      ref: 'A',
      rootPath: path.join(__dirname, '../__mocks__/dependencyChanges'),
      manifestPath: 'plain-package.json',
      lockfilePath: 'plain-yarn.lock',
    });

    expect(baselineChanges).toEqual(new Set());
  });
});
