import path from 'path';

import { compareBaseline } from './compareBaseline';
import { getDependencies } from './getDependencies';
import TestLogger from './testLogger';

jest.setTimeout(10000);

const getContext: any = (baselineCommits: string[]) => ({
  log: new TestLogger(),
  git: { baselineCommits },
});

describe('compareBaseline', () => {
  it('finds changed dependency names', async () => {
    const ctx = getContext();
    const headDependencies = await getDependencies(ctx, {
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
    const headDependencies = await getDependencies(ctx, {
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
    const headDependencies = await getDependencies(ctx, {
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
    const headDependencies = await getDependencies(ctx, {
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

  it('runs the manifest check on yarn berry lock files successfully', async () => {
    const ctx = getContext();
    const headDependencies = await getDependencies(ctx, {
      rootPath: path.join(__dirname, '../__mocks__/dependencyChanges'),
      manifestPath: 'berry-package.json',
      lockfilePath: 'berry-yarn.lock',
    });
    const baselineChanges = await compareBaseline(ctx, headDependencies, {
      ref: 'A',
      rootPath: path.join(__dirname, '../__mocks__/dependencyChanges'),
      manifestPath: 'berry-package.json',
      lockfilePath: 'berry-yarn.lock',
    });

    expect(baselineChanges).toEqual(new Set());
  });

  it('does not find yarn berry changed dependency name for set resolution', async () => {
    const ctx = getContext();
    const headDependencies = await getDependencies(ctx, {
      rootPath: path.join(__dirname, '../__mocks__/dependencyChanges'),
      manifestPath: 'berry-package.json',
      lockfilePath: 'berry-yarn.lock',
    });
    const baselineChanges = await compareBaseline(ctx, headDependencies, {
      ref: 'A',
      rootPath: path.join(__dirname, '../__mocks__/dependencyChanges'),
      manifestPath: 'berry-chalk-package.json',
      lockfilePath: 'berry-chalk-yarn.lock',
    });

    expect(baselineChanges).toEqual(new Set(['husky']));
  });

  it('finds yarn berry dependency change name', async () => {
    const ctx = getContext();
    const headDependencies = await getDependencies(ctx, {
      rootPath: path.join(__dirname, '../__mocks__/dependencyChanges'),
      manifestPath: 'berry-package.json',
      lockfilePath: 'berry-yarn.lock',
    });
    const baselineChanges = await compareBaseline(ctx, headDependencies, {
      ref: 'A',
      rootPath: path.join(__dirname, '../__mocks__/dependencyChanges'),
      manifestPath: 'berry-chalk-package.json',
      lockfilePath: 'berry-chalk-yarn.lock',
    });

    expect(baselineChanges).toEqual(new Set(['husky']));
  });
});
