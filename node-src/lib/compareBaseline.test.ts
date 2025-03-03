import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

import { compareBaseline } from './compareBaseline';
import { getDependencies } from './getDependencies';
import TestLogger from './testLogger';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const getContext: any = (baselineCommits: string[]) => ({
  log: new TestLogger(),
  git: { baselineCommits },
});

describe('compareBaseline', () => {
  it('finds changed dependency names', async () => {
    const ctx = getContext();
    const headDependencies = await getDependencies(ctx, {
      rootPath: path.join(__dirname, '../__mocks__/dependencyChanges/react-async-10'),
      manifestPath: 'package.json',
      lockfilePath: 'yarn.lock',
    });
    const baselineChanges = await compareBaseline(ctx, headDependencies, {
      rootPath: path.join(__dirname, '../__mocks__/dependencyChanges/react-async-9'),
      manifestPath: 'package.json',
      lockfilePath: 'yarn.lock',
    });

    expect(baselineChanges).toEqual(new Set(['react-async']));
  });

  it('finds added dependency names', async () => {
    const ctx = getContext();
    const headDependencies = await getDependencies(ctx, {
      rootPath: path.join(__dirname, '../__mocks__/dependencyChanges/react-async-9'),
      manifestPath: 'package.json',
      lockfilePath: 'yarn.lock',
    });
    const baselineChanges = await compareBaseline(ctx, headDependencies, {
      rootPath: path.join(__dirname, '../__mocks__/dependencyChanges/plain'),
      manifestPath: 'package.json',
      lockfilePath: 'yarn.lock',
    });

    expect(baselineChanges).toEqual(new Set(['react-async']));
  });

  it('finds removed dependency names', async () => {
    const ctx = getContext();
    const headDependencies = await getDependencies(ctx, {
      rootPath: path.join(__dirname, '../__mocks__/dependencyChanges/plain'),
      manifestPath: 'package.json',
      lockfilePath: 'yarn.lock',
    });
    const baselineChanges = await compareBaseline(ctx, headDependencies, {
      rootPath: path.join(__dirname, '../__mocks__/dependencyChanges/react-async-9'),
      manifestPath: 'package.json',
      lockfilePath: 'yarn.lock',
    });

    expect(baselineChanges).toEqual(new Set(['react-async']));
  });

  it('finds nothing given identical files', async () => {
    const ctx = getContext();
    const headDependencies = await getDependencies(ctx, {
      rootPath: path.join(__dirname, '../__mocks__/dependencyChanges/plain'),
      manifestPath: 'package.json',
      lockfilePath: 'yarn.lock',
    });
    const baselineChanges = await compareBaseline(ctx, headDependencies, {
      rootPath: path.join(__dirname, '../__mocks__/dependencyChanges/plain'),
      manifestPath: 'package.json',
      lockfilePath: 'yarn.lock',
    });

    expect(baselineChanges).toEqual(new Set());
  });

  it('runs the manifest check on yarn berry lock files successfully', async () => {
    const ctx = getContext();
    const headDependencies = await getDependencies(ctx, {
      rootPath: path.join(__dirname, '../__mocks__/dependencyChanges/berry'),
      manifestPath: 'package.json',
      lockfilePath: 'yarn.lock',
    });
    const baselineChanges = await compareBaseline(ctx, headDependencies, {
      rootPath: path.join(__dirname, '../__mocks__/dependencyChanges/berry'),
      manifestPath: 'package.json',
      lockfilePath: 'yarn.lock',
    });

    expect(baselineChanges).toEqual(new Set());
  });

  it('does not find yarn berry changed dependency name for set resolution', async () => {
    const ctx = getContext();
    const headDependencies = await getDependencies(ctx, {
      rootPath: path.join(__dirname, '../__mocks__/dependencyChanges/berry'),
      manifestPath: 'package.json',
      lockfilePath: 'yarn.lock',
    });
    const baselineChanges = await compareBaseline(ctx, headDependencies, {
      rootPath: path.join(__dirname, '../__mocks__/dependencyChanges/berry-chalk'),
      manifestPath: 'package.json',
      lockfilePath: 'yarn.lock',
    });

    expect(baselineChanges).toEqual(new Set(['husky']));
  });

  it('finds yarn berry dependency change name', async () => {
    const ctx = getContext();
    const headDependencies = await getDependencies(ctx, {
      rootPath: path.join(__dirname, '../__mocks__/dependencyChanges/berry'),
      manifestPath: 'package.json',
      lockfilePath: 'yarn.lock',
    });
    const baselineChanges = await compareBaseline(ctx, headDependencies, {
      rootPath: path.join(__dirname, '../__mocks__/dependencyChanges/berry-chalk'),
      manifestPath: 'package.json',
      lockfilePath: 'yarn.lock',
    });

    expect(baselineChanges).toEqual(new Set(['husky']));
  });
});
