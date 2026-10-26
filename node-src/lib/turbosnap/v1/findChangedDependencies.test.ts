import snykGraph from '@snyk/dep-graph';
import {
  copyFileSync as unMockedCopyFileSync,
  mkdtempSync as unMockedMkdtempSync,
  readFileSync as unMockedReadFileSync,
  realpathSync,
  rmSync,
  statSync as unMockedStatSync,
} from 'fs';
import { getPnpmLockfileParser, parsePnpmWorkspaceProject } from 'snyk-nodejs-lockfile-parser';
import snyk from 'snyk-nodejs-plugin';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';

import { Context } from '../../..';
import * as git from '../../../git/git';
import getEnvironment from '../../getEnvironment';
import TestLogger from '../../testLogger';
import { BaselineCheckoutFailedError, LockFileParseFailedError } from './errors';
import { findChangedDependencies } from './findChangedDependencies';

vi.mock('snyk-nodejs-lockfile-parser');
vi.mock('snyk-nodejs-plugin');
vi.mock('@snyk/dep-graph');
vi.mock('yarn-or-npm');
vi.mock('../../../git/git');
vi.mock('fs');

const tmpdir = '/tmpdir';

const statSync = unMockedStatSync as Mock;
statSync.mockReturnValue({ size: 1 });

const copyFileSync = unMockedCopyFileSync as Mock;
copyFileSync.mockReturnValue(undefined);

const mkdtempSync = unMockedMkdtempSync as Mock;
mkdtempSync.mockReturnValue(tmpdir);

const readFileSync = unMockedReadFileSync as Mock;
readFileSync.mockReturnValue('');

const getRepositoryRoot = vi.mocked(git.getRepositoryRoot);
const checkoutFile = vi.mocked(git.checkoutFile);
const findFilesFromRepositoryRoot = vi.mocked(git.findFilesFromRepositoryRoot);
const pnpmLockfileParser = vi.mocked(getPnpmLockfileParser);
const pnpmWorkspaceProject = vi.mocked(parsePnpmWorkspaceProject);
const inspect = vi.mocked(snyk.inspect);
const createChangedPackagesGraph = vi.mocked(snykGraph.createChangedPackagesGraph);

beforeEach(() => {
  getRepositoryRoot.mockResolvedValue('/root');
  // always resolve files in the root, but not subdirs
  findFilesFromRepositoryRoot.mockImplementation((_, __, file) =>
    Promise.resolve(file.startsWith('**') ? [] : [file])
  );
  checkoutFile.mockResolvedValue();
});
afterEach(() => {
  getRepositoryRoot.mockReset();
  checkoutFile.mockReset();
  findFilesFromRepositoryRoot.mockReset();
  pnpmLockfileParser.mockReset();
  pnpmWorkspaceProject.mockReset();
  inspect.mockReset();
  createChangedPackagesGraph.mockReset();
});

const getContext = (
  input: Partial<Omit<Context, 'git' | 'options'>> & {
    git: Partial<Context['git']>;
    options?: Partial<Context['options']>;
  }
) =>
  ({
    log: new TestLogger(),
    options: {},
    env: getEnvironment(),
    ...input,
  }) as Context;

const AMetadataChanges = [{ changedFiles: ['package.json'], commit: 'A' }];

// Recursive input type for buildDepGraph
type builDepGraphInput = string | { name: string; dependencies: builDepGraphInput[] };

// Test helper to build a dep graph structure from arrays of strings/objects
function buildDepGraph(depSpec: builDepGraphInput[]) {
  return depSpec.map((dep) => {
    if (typeof dep === 'string') {
      const [name, version] = dep.split('@');
      return { name, version, dependencies: {} };
    } else {
      const [name, version] = dep.name.split('@');
      return {
        name,
        version,
        dependencies: Object.fromEntries(buildDepGraph(dep.dependencies).map((d) => [d.name, d])),
      };
    }
  });
}

function mockInspect(...inspectCalls: builDepGraphInput[][]) {
  for (const dependencies of inspectCalls) {
    inspect.mockResolvedValueOnce({
      scannedProjects: [
        {
          depGraph: {
            getDepPkgs: () => buildDepGraph(dependencies),
          },
        },
      ],
    } as any);
  }
}

function mockChangedPackagesGraph(dependencies: string[]) {
  createChangedPackagesGraph.mockResolvedValue({
    getDepPkgs: () =>
      dependencies.map((dep: string) => {
        const [name, version] = dep.split('@');
        return { name, version };
      }),
  } as any);
}

describe('findChangedDependencies', () => {
  it('returns nothing given no changes', async () => {
    const context = getContext({ git: { packageMetadataChanges: [] } });

    await expect(findChangedDependencies(context)).resolves.toEqual([]);
    expect(checkoutFile).not.toHaveBeenCalled();
    expect(inspect).not.toHaveBeenCalled();
  });

  it('returns nothing given no changes to found package metadata', async () => {
    const context = getContext({
      // Only detected metadata change is to a file that's not on disk
      git: { packageMetadataChanges: [{ changedFiles: ['foo/package.json'], commit: 'A' }] },
    });

    await expect(findChangedDependencies(context)).resolves.toEqual([]);

    expect(checkoutFile).not.toHaveBeenCalled();
    expect(inspect).not.toHaveBeenCalled();
  });

  it('returns nothing when dependency tree is unchanged', async () => {
    mockInspect(/* HEAD */ ['react@18.2.0'], /* Baseline A */ ['react@18.2.0']);
    mockChangedPackagesGraph([]);

    const context = getContext({ git: { packageMetadataChanges: AMetadataChanges } });

    await expect(findChangedDependencies(context)).resolves.toEqual([]);
  });

  it('returns nothing when dependency tree is empty', async () => {
    mockInspect(/* HEAD */ [], /* Baseline A */ []);
    mockChangedPackagesGraph([]);

    const context = getContext({ git: { packageMetadataChanges: AMetadataChanges } });

    await expect(findChangedDependencies(context)).resolves.toEqual([]);
  });

  it('returns nothing when dependency tree is unchanged', async () => {
    mockInspect(/* HEAD */ ['react@18.2.0'], /* Baseline A */ ['react@18.2.0']);
    mockChangedPackagesGraph([]);

    const context = getContext({ git: { packageMetadataChanges: AMetadataChanges } });

    await expect(findChangedDependencies(context)).resolves.toEqual([]);
  });

  it('returns updated dependencies', async () => {
    mockInspect(/* HEAD */ ['react@18.2.0'], /* Baseline A */ ['react@18.3.0']);
    mockChangedPackagesGraph(['react@18.3.0']);

    const context = getContext({ git: { packageMetadataChanges: AMetadataChanges } });

    await expect(findChangedDependencies(context)).resolves.toEqual(['react']);
  });

  it('returns added/removed dependencies', async () => {
    mockInspect(/* HEAD */ ['react@18.2.0'], /* Baseline A */ ['vue@3.2.0']);
    mockChangedPackagesGraph(['vue@3.2.0', 'react@18.2.0']);

    const context = getContext({ git: { packageMetadataChanges: AMetadataChanges } });

    await expect(findChangedDependencies(context)).resolves.toEqual(['vue', 'react']);
  });

  it('finds updated transient dependencies', async () => {
    mockInspect(
      // HEAD
      [{ name: 'react@18.2.0', dependencies: ['loose-envify@1.3.1'] }],
      // Baseline A
      [{ name: 'react@18.2.0', dependencies: ['loose-envify@1.4.0'] }]
    );
    mockChangedPackagesGraph(['loose-envify']);

    const context = getContext({ git: { packageMetadataChanges: AMetadataChanges } });

    await expect(findChangedDependencies(context)).resolves.toEqual(['loose-envify']);
  });

  it('combines and dedupes changes for multiple baselines', async () => {
    mockInspect(
      // HEAD
      ['react@18.2.0', 'lodash@4.17.21'],
      // Baseline A
      ['react@18.3.0', 'lodash@4.17.3'],
      // Baseline B
      ['react@18.3.0', 'lodash@4.18.0']
    );

    mockChangedPackagesGraph(['react@18.3.0', 'lodash@4.18.0']);

    const context = getContext({
      git: {
        packageMetadataChanges: [
          { changedFiles: ['package.json'], commit: 'A' },
          { changedFiles: ['package.json'], commit: 'B' },
        ],
      },
    });

    await expect(findChangedDependencies(getContext(context))).resolves.toEqual([
      'react',
      'lodash',
    ]);
  });

  it('looks for manifest and lock files in subpackages', async () => {
    findFilesFromRepositoryRoot.mockImplementation((_, __, file) =>
      Promise.resolve(file.startsWith('**') ? [file.replace('**', 'subdir')] : [file])
    );

    mockInspect(
      // HEAD /
      ['react@18.2.0'],
      // HEAD /subdir/
      ['lodash@4.17.21'],
      // Baseline A /
      ['react@18.3.0'],
      // BAseline A /subdir/
      ['lodash@4.18.0']
    );

    mockChangedPackagesGraph(['react@18.3.0', 'lodash@4.18.0']);

    const context = getContext({
      git: {
        packageMetadataChanges: [
          { changedFiles: ['package.json', 'subdir/package.json'], commit: 'A' },
        ],
      },
    });

    await expect(findChangedDependencies(context)).resolves.toEqual(
      expect.arrayContaining(['react', 'lodash'])
    );

    // HEAD and baseline, for both the root and the subpackage.
    expect(inspect).toHaveBeenCalledTimes(4);
    for (const file of ['package.json', 'yarn.lock', 'subdir/package.json', 'subdir/yarn.lock']) {
      expect(checkoutFile).toHaveBeenCalledWith(expect.anything(), 'A', file, tmpdir);
    }
  });

  it('uses root lockfile when subpackage lockfile is missing', async () => {
    findFilesFromRepositoryRoot.mockImplementation((_, __, file) => {
      if (file === 'subdir/yarn.lock') return Promise.resolve([]);
      return Promise.resolve(file.startsWith('**') ? [file.replace('**', 'subdir')] : [file]);
    });

    mockInspect(
      // HEAD /
      [],
      // HEAD /subdir/
      [],
      // A /
      [],
      // A /subdir/
      []
    );
    mockChangedPackagesGraph([]);

    const context = getContext({
      git: {
        packageMetadataChanges: [{ changedFiles: ['yarn.lock'], commit: 'A' }],
      },
    });

    await expect(findChangedDependencies(context)).resolves.toEqual([]);

    expect(inspect).toHaveBeenCalledWith(
      tmpdir,
      expect.stringContaining('/yarn.lock'), // root lockfile
      { dev: true, strictOutOfSync: false }
    );
  });

  it('ignores lockfile changes if metadata file is untraced', async () => {
    findFilesFromRepositoryRoot.mockImplementation((_, __, file) => {
      if (file === 'subdir/yarn.lock') return Promise.resolve([]);
      return Promise.resolve(file.startsWith('**') ? [file.replace('**', 'subdir')] : [file]);
    });

    const context = getContext({
      git: {
        // The metadata changes are filtered by untraced, but lockfile changes could still get in here
        packageMetadataChanges: [{ changedFiles: ['yarn.lock'], commit: 'A' }],
      },
      options: {
        untraced: ['package.json', 'subdir/package.json'],
      },
    });

    await expect(findChangedDependencies(context)).resolves.toEqual([]);

    expect(checkoutFile).not.toHaveBeenCalled();
    expect(inspect).not.toHaveBeenCalled();
  });

  it('uses package-lock.json if yarn.lock is missing', async () => {
    findFilesFromRepositoryRoot.mockImplementation((_, __, file) => {
      if (file.endsWith('yarn.lock'))
        return Promise.resolve([file.replace('yarn.lock', 'package-lock.json')]);
      return Promise.resolve(file.startsWith('**') ? [file.replace('**', 'subdir')] : [file]);
    });

    mockInspect(/* HEAD */ [], /* Baseline A */ []);
    mockChangedPackagesGraph([]);

    const context = getContext({
      git: {
        packageMetadataChanges: [{ changedFiles: ['subdir/package-lock.json'], commit: 'A' }],
      },
    });

    await expect(findChangedDependencies(context)).resolves.toEqual([]);

    expect(inspect).toHaveBeenCalledWith(tmpdir, `${tmpdir}/package-lock.json`, {
      dev: true,
      strictOutOfSync: false,
    });
  });

  it('resolves manifest and lockfile paths against the repository root', async () => {
    // Mock the repository root to be different from current working directory
    getRepositoryRoot.mockResolvedValue('/root/subdir');

    // Mock findFilesFromRepositoryRoot to return relative paths
    findFilesFromRepositoryRoot.mockImplementation((_, __, ...patterns) => {
      const results: string[] = [];
      for (const pattern of patterns) {
        if (pattern === 'package.json') {
          results.push('package.json');
        } else if (
          pattern === 'yarn.lock' ||
          pattern === 'pnpm-lock.yaml' ||
          pattern === 'package-lock.json'
        ) {
          results.push('package-lock.json');
        }
      }
      return Promise.resolve(results);
    });

    mockInspect(/* HEAD */ ['react@18.2.0'], /* Baseline A */ ['react@18.3.0']);
    mockChangedPackagesGraph(['react@18.3.0']);

    const context = getContext({
      git: {
        packageMetadataChanges: [{ changedFiles: ['package.json'], commit: 'A' }],
      },
    });

    await expect(findChangedDependencies(context)).resolves.toEqual(['react']);

    expect(copyFileSync).toHaveBeenCalledWith(
      '/root/subdir/package.json',
      `${tmpdir}/package.json`
    );
    expect(copyFileSync).toHaveBeenCalledWith(
      '/root/subdir/package-lock.json',
      `${tmpdir}/package-lock.json`
    );
  });

  it('resolves pnpm workspace manifests against their own lockfile importer', async () => {
    findFilesFromRepositoryRoot.mockImplementation((_, __, ...patterns) => {
      if (patterns[0] === 'package.json') return Promise.resolve(['package.json']);
      if (patterns[0] === '**/package.json') return Promise.resolve(['packages/ui/package.json']);
      // Only the root has a lockfile; nested lookups use full paths and find nothing.
      return Promise.resolve(patterns.includes('pnpm-lock.yaml') ? ['pnpm-lock.yaml'] : []);
    });
    pnpmLockfileParser.mockReturnValue({ importers: { '.': {}, 'packages/ui': {} } } as any);
    const importers: string[] = [];
    pnpmWorkspaceProject.mockImplementation(async (_manifest, _lockfile, _options, importer) => {
      importers.push(importer);
      return { getDepPkgs: () => [] } as any;
    });
    mockChangedPackagesGraph(['moment@2.31.0']);

    const context = getContext({
      git: { packageMetadataChanges: [{ changedFiles: ['pnpm-lock.yaml'], commit: 'A' }] },
    });

    // The changed dependency comes from the mocked graph comparison; the assertions on the
    // importer are what exercise the pnpm path.
    await expect(findChangedDependencies(context)).resolves.toEqual(['moment']);

    // HEAD and baseline for both the root and the nested package.
    expect(importers.toSorted()).toEqual(['.', '.', 'packages/ui', 'packages/ui']);
    expect(inspect).not.toHaveBeenCalled();
  });
});

describe('findChangedDependencies with an added workspace', () => {
  const manifestPath = 'packages/new-workspace/package.json';
  const lockfilePath = 'pnpm-lock.yaml';
  const workspaceName = 'new-workspace';
  const getChangedFilesWithStatus = vi.mocked(git.getChangedFilesWithStatus);
  const realpath = vi.mocked(realpathSync);
  let context: Context;
  let checkoutError: BaselineCheckoutFailedError;
  let rootGraph: snykGraph.DepGraph;
  let workspaceGraph: snykGraph.DepGraph;
  let depGraph: typeof snykGraph;

  // Use the real graph comparison so the safety checks see actual added, removed and
  // upgraded dependencies, rather than a predetermined list from a comparator mock.
  function graph(name: string, dependencies: [string, string][] = []) {
    const builder = new depGraph.DepGraphBuilder({ name: 'pnpm' }, { name, version: '1.0.0' });
    for (const [dependency, version] of dependencies) {
      builder.addPkgNode({ name: dependency, version }, dependency);
      builder.connectDep(builder.rootNodeId, dependency);
    }
    return builder.build();
  }

  function mockGraphs(...graphs: snykGraph.DepGraph[]) {
    pnpmWorkspaceProject.mockReset();
    for (const dependencyGraph of graphs) {
      pnpmWorkspaceProject.mockResolvedValueOnce(dependencyGraph);
    }
  }

  beforeEach(async () => {
    depGraph = await vi.importActual<typeof snykGraph>('@snyk/dep-graph');
    createChangedPackagesGraph.mockImplementation(depGraph.createChangedPackagesGraph);
    rootGraph = graph('root', [['existing-dependency', '1.0.0']]);
    const builder = new depGraph.DepGraphBuilder(
      { name: 'pnpm' },
      { name: workspaceName, version: '1.0.0' }
    );
    builder.addPkgNode({ name: 'direct-dependency', version: '1.0.0' }, 'direct');
    builder.addPkgNode({ name: 'transitive-dependency', version: '1.0.0' }, 'transitive');
    builder.connectDep(builder.rootNodeId, 'direct');
    builder.connectDep('direct', 'transitive');
    workspaceGraph = builder.build();
    mockGraphs(rootGraph, rootGraph, workspaceGraph);

    findFilesFromRepositoryRoot.mockImplementation(async (_, __, ...patterns) => {
      if (patterns[0] === 'package.json') return ['package.json'];
      if (patterns[0] === '**/package.json') return [manifestPath];
      return patterns.includes(lockfilePath) ? [lockfilePath] : [];
    });
    const parser = await vi.importActual<typeof import('snyk-nodejs-lockfile-parser')>(
      'snyk-nodejs-lockfile-parser'
    );
    pnpmLockfileParser.mockReturnValue(
      parser.getPnpmLockfileParser(`
lockfileVersion: '9.0'
importers:
  .: {}
  packages/new-workspace: {}
`)
    );
    readFileSync.mockReturnValue(JSON.stringify({ name: workspaceName }));
    realpath.mockImplementation(String);
    getChangedFilesWithStatus.mockResolvedValue([{ path: manifestPath, status: 'added' }]);
    checkoutError = new BaselineCheckoutFailedError(`A:${manifestPath}`);
    checkoutFile.mockImplementation(async (_, reference, file) => {
      if (reference === 'A' && file === manifestPath) throw checkoutError;
    });
    context = getContext({
      git: {
        packageMetadataChanges: [{ commit: 'A', changedFiles: [lockfilePath, manifestPath] }],
      },
    });
    // Keep parser mock responses deterministic across manifests and baselines.
    context.env.CHROMATIC_TURBOSNAP_MANIFEST_CONCURRENCY = 1;
    context.env.CHROMATIC_TURBOSNAP_PACKAGE_CONCURRENCY = 1;
  });

  afterEach(() => {
    getChangedFilesWithStatus.mockReset();
    realpath.mockReset();
    readFileSync.mockReturnValue('');
  });

  it('includes the new workspace and its direct and transitive dependencies', async () => {
    await expect(findChangedDependencies(context)).resolves.toEqual(
      expect.arrayContaining([workspaceName, 'direct-dependency', 'transitive-dependency'])
    );
    expect(getChangedFilesWithStatus).toHaveBeenCalledWith(context, 'A', 'HEAD');
    expect(rmSync).toHaveBeenCalledWith(tmpdir, { recursive: true, force: true });
  });

  it('does not mark unchanged dependencies of an existing workspace as changed', async () => {
    const changes = await findChangedDependencies(context);
    expect(changes).not.toContain('existing-dependency');
    expect(changes).not.toContain('root');
    expect(new Set(changes).size).toBe(changes.length);
  });

  it('allows an existing workspace to start depending on the new workspace', async () => {
    const headRoot = graph('root', [
      ['existing-dependency', '1.0.0'],
      [workspaceName, '1.0.0'],
    ]);
    mockGraphs(headRoot, rootGraph, workspaceGraph);

    const changes = await findChangedDependencies(context);
    expect(changes).toContain(workspaceName);
    expect(changes).toContain('transitive-dependency');
    expect(changes.filter((name) => name === workspaceName)).toHaveLength(1);
  });

  it.each([
    ['upgraded', [['existing-dependency', '2.0.0']]],
    ['removed', []],
    [
      'added',
      [
        ['existing-dependency', '1.0.0'],
        ['another-dependency', '1.0.0'],
      ],
    ],
  ] satisfies [string, [string, string][]][])(
    'preserves the fallback when an existing workspace dependency is %s',
    async (_, dependencies) => {
      mockGraphs(graph('root', dependencies), rootGraph, workspaceGraph);
      await expect(findChangedDependencies(context)).rejects.toBe(checkoutError);
    }
  );

  it.each(['dependency', 'root'])(
    'preserves the fallback for a baseline %s name collision',
    async (collision) => {
      const baseline =
        collision === 'root' ? graph(workspaceName) : graph('root', [[workspaceName, '0.9.0']]);
      mockGraphs(graph('root', [[workspaceName, '1.0.0']]), baseline, workspaceGraph);
      await expect(findChangedDependencies(context)).rejects.toBe(checkoutError);
    }
  );

  it('preserves the fallback when a baseline graph lacks root metadata', async () => {
    const incompleteGraph = new Proxy(rootGraph, {
      get(target, property, receiver) {
        return property === 'rootPkg' ? undefined : Reflect.get(target, property, receiver);
      },
    });
    mockGraphs(rootGraph, incompleteGraph, workspaceGraph);
    await expect(findChangedDependencies(context)).rejects.toBe(checkoutError);
  });

  it('checks dependency changes against every baseline', async () => {
    context.git.packageMetadataChanges = [
      { commit: 'A', changedFiles: [lockfilePath, manifestPath] },
      { commit: 'B', changedFiles: [lockfilePath] },
    ];
    mockGraphs(
      rootGraph,
      rootGraph,
      graph('root', [['existing-dependency', '0.9.0']]),
      workspaceGraph,
      workspaceGraph
    );
    await expect(findChangedDependencies(context)).rejects.toBe(checkoutError);
    expect(checkoutFile).toHaveBeenCalledWith(context, 'B', manifestPath, tmpdir);
  });

  it('combines an addition at one baseline with an unchanged workspace at another', async () => {
    context.git.packageMetadataChanges = [
      { commit: 'A', changedFiles: [lockfilePath, manifestPath] },
      { commit: 'B', changedFiles: [lockfilePath] },
    ];
    mockGraphs(rootGraph, rootGraph, rootGraph, workspaceGraph, workspaceGraph);
    await expect(findChangedDependencies(context)).resolves.toEqual(
      expect.arrayContaining([workspaceName, 'direct-dependency', 'transitive-dependency'])
    );
  });

  describe('manifest qualification and error handling', () => {
    it.each(['modified', 'deleted', 'renamed'] as const)(
      'preserves the fallback when the missing manifest is %s, not added',
      async (status) => {
        getChangedFilesWithStatus.mockResolvedValue([{ path: manifestPath, status }]);
        await expect(findChangedDependencies(context)).rejects.toBe(checkoutError);
      }
    );

    it('does not qualify an addition of a different manifest', async () => {
      getChangedFilesWithStatus.mockResolvedValue([
        { path: 'other/package.json', status: 'added' },
      ]);
      await expect(findChangedDependencies(context)).rejects.toBe(checkoutError);
    });

    it('requires the checkout error to identify the exact baseline manifest', async () => {
      checkoutError = new BaselineCheckoutFailedError(`B:${manifestPath}`);
      await expect(findChangedDependencies(context)).rejects.toBe(checkoutError);
      expect(getChangedFilesWithStatus).not.toHaveBeenCalled();
    });

    it('does not swallow unrelated checkout errors', async () => {
      const error = new Error('Unable to read repository');
      checkoutFile.mockRejectedValue(error);
      await expect(findChangedDependencies(context)).rejects.toBe(error);
      expect(getChangedFilesWithStatus).not.toHaveBeenCalled();
    });

    it('preserves the fallback if the baseline lockfile is unavailable', async () => {
      const error = new BaselineCheckoutFailedError(`A:${lockfilePath}`);
      checkoutFile.mockImplementation(async (_, __, file) => {
        if (file === lockfilePath) throw error;
      });
      await expect(findChangedDependencies(context)).rejects.toBe(error);
      expect(getChangedFilesWithStatus).not.toHaveBeenCalled();
      expect(checkoutFile).not.toHaveBeenCalledWith(context, 'A', manifestPath, tmpdir);
    });

    it('propagates baseline dependency parsing failures', async () => {
      pnpmWorkspaceProject.mockReset();
      pnpmWorkspaceProject
        .mockResolvedValueOnce(rootGraph)
        .mockRejectedValueOnce(new Error('Invalid lockfile'));
      await expect(findChangedDependencies(context)).rejects.toBeInstanceOf(
        LockFileParseFailedError
      );
    });

    it.each([{}, { name: 123 }, null])(
      'preserves the fallback for an invalid workspace name: %j',
      async (manifest) => {
        readFileSync.mockReturnValue(JSON.stringify(manifest));
        await expect(findChangedDependencies(context)).rejects.toBe(checkoutError);
      }
    );

    it('does not swallow malformed manifest JSON', async () => {
      readFileSync.mockReturnValue('{');
      await expect(findChangedDependencies(context)).rejects.toBeInstanceOf(SyntaxError);
    });

    it.each(['/outside/package.json', '/root-sibling/package.json'])(
      'rejects an added manifest whose symlink resolves outside the repository: %s',
      async (target) => {
        realpath.mockImplementation((file) => (String(file) === '/root' ? '/root' : target));
        await expect(findChangedDependencies(context)).rejects.toBe(checkoutError);
        expect(readFileSync).not.toHaveBeenCalledWith(target, 'utf8');
      }
    );

    it('allows an added manifest whose symlink resolves inside the repository', async () => {
      const target = '/root/manifests/new-workspace.json';
      realpath.mockImplementation((file) => (String(file) === '/root' ? '/root' : target));
      await expect(findChangedDependencies(context)).resolves.toContain(workspaceName);
      expect(readFileSync).toHaveBeenCalledWith(target, 'utf8');
    });
  });
});
