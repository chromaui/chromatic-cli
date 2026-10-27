import { DepGraphBuilder } from '@snyk/dep-graph';
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

async function getMockedDependencies(headName: string, baseName: string) {
  const ctx = getContext();
  return {
    head: await getDependencies(ctx, {
      rootPath: path.join(__dirname, `../../../__mocks__/dependencyChanges/${headName}`),
      manifestPath: 'package.json',
      lockfilePath: 'yarn.lock',
    }),
    base: await getDependencies(ctx, {
      rootPath: path.join(__dirname, `../../../__mocks__/dependencyChanges/${baseName}`),
      manifestPath: 'package.json',
      lockfilePath: 'yarn.lock',
    }),
  };
}

// Builds a graph from `parent -> child` edges between `name@version` packages, where `root` is the
// project itself.
function buildGraph(...edges: string[]) {
  const builder = new DepGraphBuilder({ name: 'npm' }, { name: 'root', version: '1.0.0' });
  for (const edge of edges) {
    const [parent, child] = edge.split(' -> ');
    for (const id of [parent, child]) {
      if (id === 'root') continue;
      const [name, version] = id.split('@');
      builder.addPkgNode({ name, version }, id);
    }
    builder.connectDep(parent === 'root' ? builder.rootNodeId : parent, child);
  }
  return builder.build();
}

describe('compareBaseline', () => {
  it('finds a version that something now depends on in place of another version', async () => {
    // A dedupe moves a onto the is-number b already had, while d keeps the old one installed.
    const base = buildGraph(
      'root -> a@1.0.0',
      'root -> b@1.0.0',
      'root -> d@1.0.0',
      'a@1.0.0 -> is-number@7.0.0',
      'b@1.0.0 -> is-number@7.1.0',
      'd@1.0.0 -> is-number@7.0.0'
    );
    const head = buildGraph(
      'root -> a@1.0.0',
      'root -> b@1.0.0',
      'root -> d@1.0.0',
      'a@1.0.0 -> is-number@7.1.0',
      'b@1.0.0 -> is-number@7.1.0',
      'd@1.0.0 -> is-number@7.0.0'
    );

    const { packages, removedNames } = await compareBaseline(head, base);
    expect(packages).toEqual(new Set(['is-number@7.1.0']));
    expect(removedNames).toEqual(new Set());
  });

  it('finds a version that an installed package switches to, when both versions stay', async () => {
    // a@2 moves from b@2 back to b@1. a@1 already used b@1 and d still uses b@2.
    const base = buildGraph(
      'root -> a@1',
      'root -> c@1',
      'root -> d@1',
      'a@1 -> b@1',
      'c@1 -> a@2',
      'a@2 -> b@2',
      'd@1 -> b@2'
    );
    const head = buildGraph(
      'root -> a@1',
      'root -> c@1',
      'root -> d@1',
      'root -> e@1',
      'a@1 -> b@1',
      'c@1 -> a@2',
      'a@2 -> b@1',
      'd@1 -> b@2',
      'e@1 -> b@3'
    );

    const { packages, removedNames } = await compareBaseline(head, base);
    expect(packages).toEqual(new Set(['b@1', 'b@3', 'e@1']));
    expect(removedNames).toEqual(new Set());
  });

  it("doesn't count a parent's own version bump as a change to its dependencies", async () => {
    const base = buildGraph('root -> a@1.0.0', 'a@1.0.0 -> is-number@7.0.0');
    const head = buildGraph('root -> a@1.1.0', 'a@1.1.0 -> is-number@7.0.0');

    const { packages } = await compareBaseline(head, base);
    expect(packages).toEqual(new Set(['a@1.0.0', 'a@1.1.0']));
  });

  it('finds both versions of a changed dependency, and that the old one was removed', async () => {
    const { head, base } = await getMockedDependencies('react-async-10', 'react-async-9');
    const baselineChanges = await compareBaseline(head, base);

    expect(baselineChanges).toEqual({
      names: new Set(['react-async']),
      packages: new Set(['react-async@10.0.0', 'react-async@9.0.0']),
      removedNames: new Set(['react-async']),
    });
  });

  it('finds added dependencies without marking them removed', async () => {
    const { head, base } = await getMockedDependencies('react-async-9', 'plain');
    const baselineChanges = await compareBaseline(head, base);

    expect(baselineChanges).toEqual({
      names: new Set(['react-async']),
      packages: new Set(['react-async@9.0.0']),
      removedNames: new Set(),
    });
  });

  it('finds removed dependencies', async () => {
    const { head, base } = await getMockedDependencies('plain', 'react-async-9');
    const baselineChanges = await compareBaseline(head, base);

    expect(baselineChanges).toEqual({
      names: new Set(['react-async']),
      packages: new Set(['react-async@9.0.0']),
      removedNames: new Set(['react-async']),
    });
  });

  it('finds nothing given identical files', async () => {
    const { head, base } = await getMockedDependencies('plain', 'plain');
    const baselineChanges = await compareBaseline(head, base);

    expect(baselineChanges.names).toEqual(new Set());
  });

  it('runs the manifest check on yarn berry lock files successfully', async () => {
    const { head, base } = await getMockedDependencies('berry', 'berry');
    const baselineChanges = await compareBaseline(head, base);

    expect(baselineChanges.names).toEqual(new Set());
  });

  it('does not find yarn berry changed dependency name for set resolution', async () => {
    const { head, base } = await getMockedDependencies('berry', 'berry-chalk');
    const baselineChanges = await compareBaseline(head, base);

    expect(baselineChanges.names).toEqual(new Set(['husky']));
  });
});
