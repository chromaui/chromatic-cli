/* eslint-disable max-lines */
import snykGraph from '@snyk/dep-graph';
import {
  copyFileSync as unMockedCopyFileSync,
  lstatSync as unMockedLstatSync,
  mkdtempSync as unMockedMkdtempSync,
  readFileSync as unMockedReadFileSync,
  statSync as unMockedStatSync,
} from 'fs';
import path from 'path';
import * as snykParser from 'snyk-nodejs-lockfile-parser';
import { getPnpmLockfileParser, parsePnpmWorkspaceProject } from 'snyk-nodejs-lockfile-parser';
import snyk from 'snyk-nodejs-plugin';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';

import { Context } from '../../..';
import * as git from '../../../git/git';
import getEnvironment from '../../getEnvironment';
import TestLogger from '../../testLogger';
import { BaselineCheckoutFailedError } from './errors';
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
(unMockedLstatSync as Mock).mockReturnValue({ isSymbolicLink: () => false });

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
const { getPnpmLockfileParser: realPnpmLockfileParser } = await vi.importActual<typeof snykParser>(
  'snyk-nodejs-lockfile-parser'
);
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

// Stats that load no workspace, so every change counts, as it did before scoping.
const noStats = { modules: [] };

// The names of the changed dependencies.
const changedNames = async (...args: Parameters<typeof findChangedDependencies>) => {
  const { names } = await findChangedDependencies(...args);
  return names;
};

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
            getPkgs: () => buildDepGraph(dependencies),
            toJSON: () => ({ pkgs: [], graph: { rootNodeId: 'root', nodes: [] } }),
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

    await expect(changedNames(context, noStats)).resolves.toEqual([]);
    expect(checkoutFile).not.toHaveBeenCalled();
    expect(inspect).not.toHaveBeenCalled();
  });

  it('returns nothing given no changes to found package metadata', async () => {
    const context = getContext({
      // Only detected metadata change is to a file that's not on disk
      git: { packageMetadataChanges: [{ changedFiles: ['foo/package.json'], commit: 'A' }] },
    });

    await expect(changedNames(context, noStats)).resolves.toEqual([]);

    expect(checkoutFile).not.toHaveBeenCalled();
    expect(inspect).not.toHaveBeenCalled();
  });

  it('returns nothing when dependency tree is unchanged', async () => {
    mockInspect(/* HEAD */ ['react@18.2.0'], /* Baseline A */ ['react@18.2.0']);
    mockChangedPackagesGraph([]);

    const context = getContext({ git: { packageMetadataChanges: AMetadataChanges } });

    await expect(changedNames(context, noStats)).resolves.toEqual([]);
  });

  it('returns nothing when dependency tree is empty', async () => {
    mockInspect(/* HEAD */ [], /* Baseline A */ []);
    mockChangedPackagesGraph([]);

    const context = getContext({ git: { packageMetadataChanges: AMetadataChanges } });

    await expect(changedNames(context, noStats)).resolves.toEqual([]);
  });

  it('returns nothing when dependency tree is unchanged', async () => {
    mockInspect(/* HEAD */ ['react@18.2.0'], /* Baseline A */ ['react@18.2.0']);
    mockChangedPackagesGraph([]);

    const context = getContext({ git: { packageMetadataChanges: AMetadataChanges } });

    await expect(changedNames(context, noStats)).resolves.toEqual([]);
  });

  it('returns updated dependencies', async () => {
    mockInspect(/* HEAD */ ['react@18.2.0'], /* Baseline A */ ['react@18.3.0']);
    mockChangedPackagesGraph(['react@18.3.0']);

    const context = getContext({ git: { packageMetadataChanges: AMetadataChanges } });

    await expect(changedNames(context, noStats)).resolves.toEqual(['react']);
  });

  it('returns added/removed dependencies', async () => {
    mockInspect(/* HEAD */ ['react@18.2.0'], /* Baseline A */ ['vue@3.2.0']);
    mockChangedPackagesGraph(['vue@3.2.0', 'react@18.2.0']);

    const context = getContext({ git: { packageMetadataChanges: AMetadataChanges } });

    await expect(changedNames(context, noStats)).resolves.toEqual(['vue', 'react']);
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

    await expect(changedNames(context, noStats)).resolves.toEqual(['loose-envify']);
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

    await expect(changedNames(getContext(context), noStats)).resolves.toEqual(['react', 'lodash']);
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

    await expect(changedNames(context, noStats)).resolves.toEqual(
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

    await expect(changedNames(context, noStats)).resolves.toEqual([]);

    expect(inspect).toHaveBeenCalledWith(
      tmpdir,
      expect.stringContaining('/yarn.lock'), // root lockfile
      { dev: true, strictOutOfSync: false }
    );
  });

  it('traces copies when the root and a subpackage have no lockfile', async () => {
    findFilesFromRepositoryRoot.mockImplementation((_, __, file) => {
      if (file === '**/package.json') return Promise.resolve(['a/package.json', 'b/package.json']);
      return Promise.resolve(file === 'package.json' || file === 'a/yarn.lock' ? [file] : []);
    });
    mockInspect(['react@18.2.0'], ['react@18.3.0']);
    mockChangedPackagesGraph(['react@18.3.0']);

    const context = getContext({
      git: { packageMetadataChanges: [{ changedFiles: ['a/yarn.lock'], commit: 'A' }] },
    });
    const { names, isUnchangedCopy } = await findChangedDependencies(context, noStats);
    expect(names).toEqual(['react']);
    expect(isUnchangedCopy('node_modules/react', 'react')).toBe(false);
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

    await expect(changedNames(context, noStats)).resolves.toEqual([]);

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

    await expect(changedNames(context, noStats)).resolves.toEqual([]);

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

    await expect(changedNames(context, noStats)).resolves.toEqual(['react']);

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
      return {
        getDepPkgs: () => [],
        getPkgs: () => [],
        toJSON: () => ({ pkgs: [], graph: { rootNodeId: 'root', nodes: [] } }),
      } as any;
    });
    mockChangedPackagesGraph(['moment@2.31.0']);

    const context = getContext({
      git: { packageMetadataChanges: [{ changedFiles: ['pnpm-lock.yaml'], commit: 'A' }] },
    });

    // The changed dependency comes from the mocked graph comparison; the assertions on the
    // importer are what exercise the pnpm path.
    await expect(changedNames(context, noStats)).resolves.toEqual(['moment']);

    // HEAD and baseline for both the root and the nested package.
    expect(importers.toSorted()).toEqual(['.', '.', 'packages/ui', 'packages/ui']);
    expect(inspect).not.toHaveBeenCalled();
  });
});

// A fake dependency graph of a workspace, its own package plus its dependencies.
const fakeGraph = (name: string, dependencies: string[]) => {
  const depPkgs = dependencies.map((dep) => {
    const [, depName, version] = dep.match(/^(.+)@(.+)$/) || [];
    return { name: depName, version };
  });
  return {
    getDepPkgs: () => depPkgs,
    getPkgs: () => [{ name }, ...depPkgs],
    toJSON: () => ({ pkgs: [], graph: { rootNodeId: 'root', nodes: [] } }),
  };
};

// The last name only appears as the importer of the module before it, as Vite lists
// `.storybook/preview.ts`.
const statsWithImporter = (...names: string[]) => ({
  modules: names.slice(0, -1).map((name, id) => ({
    id,
    name,
    reasons: id === names.length - 2 ? [{ moduleName: names.at(-1) as string }] : [],
  })),
});
// Installed modules are imported by `./src/Button.tsx`, as a story's component would import them.
const stats = (...names: string[]) => ({
  modules: names.map((name, id) => ({
    id,
    name,
    reasons: name.includes('node_modules/') ? [{ moduleName: './src/Button.tsx' }] : [],
  })),
});

// Stats where `name` is imported by each of `importers`.
const statsWithImport = (name: string, ...importers: string[]) => ({
  modules: [
    ...stats('./src/Button.tsx').modules,
    { id: name, name, reasons: importers.map((moduleName) => ({ moduleName })) },
  ],
});

const lodash = './../../node_modules/lodash/index.js';
// ui declares its own lodash, shared declares `sharedDeclares`, and backend bumps the hoisted copy.
const workspaces = (sharedDeclares: string[]) => ({
  'packages/ui': { name: '@myorg/ui', head: ['react@19.0.1', 'lodash@3.10.1'] },
  'packages/shared': { name: '@myorg/shared', head: sharedDeclares },
  'packages/backend': {
    name: '@myorg/backend',
    head: ['lodash@4.17.21'],
    base: ['lodash@4.17.20'],
  },
});

// ui declares react, and backend, which the Storybook doesn't load, bumps its own.
const reactBump = {
  'packages/ui': { name: '@myorg/ui', head: ['react@19.0.1'] },
  'packages/backend': { name: '@myorg/backend', head: ['react@19.0.2'], base: ['react@19.0.1'] },
};

// The pnpm store directory of an is-number copy.
const pnpmCopy = (version: string) =>
  `node_modules/.pnpm/is-number@${version}/node_modules/is-number`;

// Serves these files, by absolute path, on top of what the `readFileSync` mock already serves.
const mockFiles = (files: Record<string, string>) => {
  const read = readFileSync.getMockImplementation() as (file: string) => string;
  readFileSync.mockImplementation((file: string) => files[file] ?? read(file));
};

// A pnpm lockfile with the root and `packages/ui` that installs these `name@version` packages, from
// the registry unless the version is a `file:` directory.
const pnpmLockfile = (...packageIds: string[]) =>
  [
    "lockfileVersion: '9.0'",
    'importers:',
    '  .: {}',
    '  packages/ui: {}',
    'packages:',
    ...packageIds.flatMap((id) => [
      `  ${id}:`,
      id.includes('@file:')
        ? `    resolution: {directory: ${id.split('@file:')[1]}, type: directory}`
        : '    resolution: {integrity: sha512-abc}',
    ]),
    'snapshots:',
    ...packageIds.map((id) => `  ${id}: {}`),
  ].join('\n');

// Serves this lockfile at the repository root, and reads it with the real pnpm parser.
const mockPnpmLockfile = (lockfile: string, files: Record<string, string> = {}) => {
  mockFiles({ '/root/pnpm-lock.yaml': lockfile, ...files });
  const parse = pnpmLockfileParser.getMockImplementation() as typeof getPnpmLockfileParser;
  pnpmLockfileParser.mockImplementation((content, ...args) =>
    content === lockfile ? realPnpmLockfileParser(content) : parse(content, ...args)
  );
};

const packageKey = ({ name, version }: { name: string; version: string }) => `${name}@${version}`;

describe('findChangedDependencies with stats', () => {
  const parsePnpmProject = vi.mocked(snykParser.parsePnpmProject);

  // `declares` lists the packages a workspace's manifest declares, by default all of `head`.
  type Graphs = Record<
    string,
    { name?: string; head: string[]; base?: string[]; declares?: string[] }
  >;

  // Serve each workspace's HEAD or baseline graph from the pnpm workspace parser, keyed by its
  // importer and by whether the manifest was read from the baseline checkout.
  // The root, which has no dependencies unless a test gives it some, changes with the lockfile.
  function mockWorkspace(workspaces: Graphs) {
    const graphs: Graphs = { '.': { name: 'root', head: [] }, ...workspaces };
    const manifestPaths = Object.keys(graphs).map((directory) =>
      directory === '.' ? 'package.json' : `${directory}/package.json`
    );
    findFilesFromRepositoryRoot.mockImplementation((_, __, ...patterns) => {
      if (patterns[0] === 'package.json') return Promise.resolve(['package.json']);
      if (patterns[0] === '**/package.json') {
        return Promise.resolve(
          manifestPaths.filter((manifestPath) => manifestPath !== 'package.json')
        );
      }
      return Promise.resolve(patterns.includes('pnpm-lock.yaml') ? ['pnpm-lock.yaml'] : []);
    });
    readFileSync.mockImplementation((file: string) => {
      if (file.endsWith('pnpm-lock.yaml')) return '';
      const directory =
        path.posix.relative(
          path.posix.dirname(file).startsWith(tmpdir) ? tmpdir : '/root',
          path.posix.dirname(file)
        ) || '.';
      const { name, head = [], declares = head } = graphs[directory] ?? {};
      const dependencies = Object.fromEntries(declares.map((dep) => dep.split(/(?!^)@/)));
      return JSON.stringify({ name, file, dependencies });
    });
    pnpmLockfileParser.mockReturnValue({
      importers: Object.fromEntries(Object.keys(graphs).map((directory) => [directory, {}])),
    } as any);
    pnpmWorkspaceProject.mockImplementation(async (manifest, _lockfile, _options, importer) => {
      // The parser names the root of a manifest without a name `package.json`.
      const { name = 'package.json', head, base = head } = graphs[importer];
      return fakeGraph(name, JSON.parse(manifest).file.startsWith(tmpdir) ? base : head) as any;
    });
    createChangedPackagesGraph.mockImplementation(async (from: any, to: any) => {
      // The packages one graph has that the other doesn't, by name and version.
      const fromKeys = new Set(from.getDepPkgs().map((pkg) => packageKey(pkg)));
      return {
        getDepPkgs: () => to.getDepPkgs().filter((pkg) => !fromKeys.has(packageKey(pkg))),
      } as any;
    });
  }

  const lockfileChange = {
    git: { packageMetadataChanges: [{ changedFiles: ['pnpm-lock.yaml'], commit: 'A' }] },
  };
  const getStatsContext = () =>
    getContext({ ...lockfileChange, storybook: { projectRoot: '/root/packages/ui' } as any });

  const uiModules = [
    './src/Button.tsx',
    './../../node_modules/.pnpm/react@19.0.1/node_modules/react/index.js',
  ];

  afterEach(() => {
    readFileSync.mockReset();
    readFileSync.mockReturnValue('');
    parsePnpmProject.mockReset();
  });

  it('ignores installed packages the tracer cannot name when scoping', async () => {
    mockWorkspace({
      // The root adds a package the Storybook installs too, at the same version.
      '.': { name: 'root', head: ['react@19.0.1'], base: [] },
      'packages/ui': {
        name: '@myorg/ui',
        head: ['react@19.0.1', 'lodash.debounce@4.0.8'],
        base: ['react@19.0.1', 'lodash.debounce@4.0.8'],
      },
    });

    await expect(
      changedNames(
        getStatsContext(),
        stats(...uiModules, './../../node_modules/lodash.debounce/index.js')
      )
    ).resolves.toEqual([]);
  });

  it('does not mistake an installed package for a workspace with the same name', async () => {
    mockWorkspace({
      'packages/ui': { name: '@myorg/ui', head: ['react@19.0.1'] },
      // A tracked example that shares its name with the installed package.
      'examples/react': { name: 'react', head: ['react@18.3.1'], base: [] },
    });

    await expect(
      changedNames(
        getStatsContext(),
        stats('./src/Button.tsx', './../../node_modules/react/index.js')
      )
    ).resolves.toEqual([]);
  });

  it('parses one package at a time by default', async () => {
    mockWorkspace({
      'packages/ui': { name: '@myorg/ui', head: ['react@19.0.1'], base: ['react@19.0.0'] },
      'packages/shared': { name: '@myorg/shared', head: ['lodash@4.17.21'], base: [] },
    });
    const parse = pnpmWorkspaceProject.getMockImplementation() as any;
    let active = 0;
    let maxActive = 0;
    pnpmWorkspaceProject.mockImplementation(async (...args) => {
      maxActive = Math.max(maxActive, ++active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return parse(...args);
    });

    const changes = await findChangedDependencies(
      getStatsContext(),
      stats(...uiModules, './../shared/src/index.ts')
    );
    expect(changes.names.toSorted()).toEqual(['lodash', 'react']);
    expect(maxActive).toBe(1);
  });

  it('ignores a dependency another workspace adds when the Storybook declares it', async () => {
    mockWorkspace({
      'packages/ui': { name: '@myorg/ui', head: ['react@19.0.1'] },
      'packages/backend': { name: '@myorg/backend', head: ['react@18.3.1'], base: [] },
    });

    await expect(changedNames(getStatsContext(), stats(...uiModules))).resolves.toEqual([]);
  });

  it('reports a change to the copy the Storybook declares', async () => {
    mockWorkspace({
      'packages/ui': { name: '@myorg/ui', head: ['react@19.0.1'], base: ['react@19.0.0'] },
      'packages/backend': { name: '@myorg/backend', head: ['react@19.0.1'], base: [] },
    });

    await expect(changedNames(getStatsContext(), stats(...uiModules))).resolves.toEqual(['react']);
  });

  it('reports changes of a workspace the Storybook loads through a relative import', async () => {
    mockWorkspace({
      'packages/ui': { name: '@myorg/ui', head: ['react@19.0.1'] },
      'packages/backend': {
        name: '@myorg/backend',
        head: ['react@19.0.2'],
        base: ['react@19.0.1'],
      },
    });

    await expect(
      changedNames(getStatsContext(), stats(...uiModules, './../backend/src/index.ts'))
    ).resolves.toEqual(['react']);
  });

  it('reports changes of a workspace whose files only appear as importers', async () => {
    mockWorkspace({
      'packages/ui': { name: '@myorg/ui', head: ['react@19.0.1'] },
      'packages/backend': {
        name: '@myorg/backend',
        head: ['react@19.0.2'],
        base: ['react@19.0.1'],
      },
    });

    await expect(
      changedNames(getStatsContext(), statsWithImporter(...uiModules, './../backend/src/index.ts'))
    ).resolves.toEqual(['react']);
  });

  it('reports changes to a package the Storybook does not declare, since it may load a hoisted copy', async () => {
    mockWorkspace({
      'packages/ui': { name: '@myorg/ui', head: ['react@19.0.1'] },
      'packages/backend': {
        name: '@myorg/backend',
        head: ['lodash@4.17.21'],
        base: ['lodash@4.17.20'],
      },
    });

    await expect(
      changedNames(getStatsContext(), stats(...uiModules, './../../node_modules/lodash/index.js'))
    ).resolves.toEqual(['lodash']);
  });

  it('does not let an untraced manifest cover changes of other workspaces', async () => {
    mockWorkspace({
      'packages/ui': { name: '@myorg/ui', head: ['react@19.0.2'], base: ['react@19.0.1'] },
      'packages/backend': {
        name: '@myorg/backend',
        head: ['react@19.0.2'],
        base: ['react@19.0.1'],
      },
    });
    const ctx = getStatsContext();
    ctx.options.untraced = ['packages/ui/package.json'];

    await expect(changedNames(ctx, stats(...uiModules))).resolves.toEqual(['react']);
  });

  it.each([
    ['an installed package', './../../node_modules/react-dom/index.js'],
    ['a workspace reached through a symlink', './node_modules/@myorg/backend/src/index.ts'],
    ['a virtual module', 'virtual:@storybook/builder-vite/project-annotations.js'],
    ['a webpack builder entry', './storybook-config-entry.js'],
    ['an opaque module', '\0commonjsHelpers.js'],
    ['a Yarn PnP virtual path', './../../.yarn/__virtual__/x-virtual-0123456789/1/packages/x/a.js'],
  ])('reports a change to a hoisted package imported by %s', async (_, importer) => {
    // ui and the root declare their own react, but the importer may resolve the copy backend bumps.
    mockWorkspace({
      '.': { name: 'root', head: ['react@19.0.1'] },
      'packages/ui': { name: '@myorg/ui', head: ['react@19.0.1'] },
      'packages/backend': {
        name: '@myorg/backend',
        head: ['react@19.0.2'],
        base: ['react@19.0.1'],
      },
    });
    await expect(
      changedNames(
        getStatsContext(),
        statsWithImport('./../../node_modules/react/index.js', './src/Button.tsx', importer)
      )
    ).resolves.toEqual(['react']);
  });

  describe('with a package of several files', () => {
    const react = './../../node_modules/react/index.js';
    const reactImpl = './../../node_modules/react/cjs/react.production.js';

    it('ignores the change when only its own files import each other', async () => {
      mockWorkspace(reactBump);
      await expect(
        changedNames(getStatsContext(), {
          modules: [
            ...statsWithImport(react, './src/Button.tsx').modules,
            { id: reactImpl, name: reactImpl, reasons: [{ moduleName: react }] },
          ],
        })
      ).resolves.toEqual([]);
    });

    it('reports the change when nothing outside the package imports it', async () => {
      mockWorkspace(reactBump);
      await expect(
        changedNames(getStatsContext(), {
          modules: [
            ...stats('./src/Button.tsx').modules,
            { id: react, name: react, reasons: [{ moduleName: null }] },
          ],
        })
      ).resolves.toEqual(['react']);
    });
  });

  describe('when a loaded workspace imports a hoisted package', () => {
    it('ignores the change when every importing workspace declares it', async () => {
      mockWorkspace(workspaces(['lodash@4.17.21']));
      await expect(
        changedNames(
          getStatsContext(),
          statsWithImport(lodash, './.storybook/preview.ts', './../shared/src/index.ts')
        )
      ).resolves.toEqual([]);
    });

    it('reports the change when an importing workspace does not declare it', async () => {
      mockWorkspace(workspaces([]));
      await expect(
        changedNames(
          getStatsContext(),
          statsWithImport(lodash, './.storybook/preview.ts', './../shared/src/index.ts')
        )
      ).resolves.toEqual(['lodash']);
    });

    it('reports the change when the importer belongs to no workspace', async () => {
      mockWorkspace(workspaces(['lodash@4.17.21']));
      await expect(
        changedNames(
          getStatsContext(),
          statsWithImport(lodash, './.storybook/preview.ts', '/elsewhere/src/index.js')
        )
      ).resolves.toEqual(['lodash']);
    });

    it('counts the members of a concatenated module as importers', async () => {
      mockWorkspace(workspaces([]));
      const concatenated = {
        id: 1,
        name: './../shared/src/index.ts + 1 modules',
        modules: [{ name: './../shared/src/index.ts' }, { name: lodash }],
        reasons: [{ moduleName: './src/Button.tsx' }],
      };
      await expect(
        changedNames(getStatsContext(), {
          modules: [...stats('./src/Button.tsx').modules, concatenated],
        })
      ).resolves.toEqual(['lodash']);
    });
  });

  it('reports changes to a package the Storybook only installs indirectly', async () => {
    mockWorkspace({
      // is-number@7.0.1 comes in through is-odd, and the preview imports the hoisted copy.
      'packages/ui': {
        name: '@myorg/ui',
        head: ['react@19.0.1', 'is-odd@3.0.1', 'is-number@7.0.1'],
        declares: ['react@19.0.1', 'is-odd@3.0.1'],
      },
      // Moves onto the version the Storybook's tree already has, so its own graph doesn't change.
      'packages/backend': {
        name: '@myorg/backend',
        head: ['is-number@7.0.1'],
        base: ['is-number@7.0.0'],
      },
    });

    await expect(
      changedNames(
        getStatsContext(),
        stats(...uiModules, './../../node_modules/is-number/index.js')
      )
    ).resolves.toEqual(['is-number']);
  });

  it('reports changes of tooling declared only at the root', async () => {
    mockWorkspace({
      '.': { name: 'root', head: ['storybook@10.0.1'], base: ['storybook@10.0.0'] },
      'packages/ui': { name: '@myorg/ui', head: ['react@19.0.1'] },
      'packages/backend': { name: '@myorg/backend', head: ['react@19.0.1'], base: [] },
    });

    await expect(
      changedNames(
        getStatsContext(),
        stats(...uiModules, './../../node_modules/storybook/dist/index.js')
      )
    ).resolves.toEqual(['storybook']);
  });

  it('reports everything a workspace added since the baseline installs', async () => {
    mockWorkspace({
      // The Storybook reaches the new workspace by path, so only its own pair names it.
      'packages/ui': { name: '@myorg/ui', head: ['react@19.0.1'] },
      'packages/extra': { name: '@myorg/extra', head: ['is-odd@3.0.1'] },
      // The Storybook doesn't load this one, so the `react` the Storybook declares is dropped. It
      // has no name, so nothing stands for the workspace itself.
      'packages/unused': { head: ['react@19.0.1', 'moment@2.31.0'] },
    });
    checkoutFile.mockImplementation(async (_, reference, file) => {
      if (file === 'packages/extra/package.json' || file === 'packages/unused/package.json') {
        throw new BaselineCheckoutFailedError(`${reference}:${file}`, { fileMissing: true });
      }
    });

    const changes = await findChangedDependencies(
      getStatsContext(),
      stats(...uiModules, './../extra/src/index.ts')
    );
    expect(changes.names.toSorted()).toEqual(['@myorg/extra', 'is-odd', 'moment']);
  });

  describe('tells the tracer which copies of a changed dependency did not change', () => {
    const addsNestedCopy = {
      'packages/ui': {
        name: '@myorg/ui',
        head: ['react@19.0.1', 'is-number@7.0.0', 'is-odd@3.0.1', 'is-number@6.0.0'],
        base: ['react@19.0.1', 'is-number@7.0.0'],
      },
    };

    it('skips a copy at a version that was already installed', async () => {
      mockWorkspace(addsNestedCopy);
      mockPnpmLockfile(pnpmLockfile('react@19.0.1', 'is-number@7.0.0', 'is-number@6.0.0'));

      const { names, isUnchangedCopy } = await findChangedDependencies(
        getStatsContext(),
        stats(...uiModules)
      );
      expect(names.toSorted()).toEqual(['is-number', 'is-odd']);
      expect(isUnchangedCopy(pnpmCopy('7.0.0'), 'is-number')).toBe(true);
      expect(isUnchangedCopy(pnpmCopy('6.0.0'), 'is-number')).toBe(false);
      // A version nothing installs at HEAD is never skipped.
      expect(isUnchangedCopy(pnpmCopy('5.0.0'), 'is-number')).toBe(false);
      // Nor is a path that isn't a copy, even of a package the lockfile installs at one version.
      expect(isUnchangedCopy('node_modules/react', 'react')).toBe(true);
      expect(isUnchangedCopy('packages/ui/src/react.ts', 'react')).toBe(false);
      // Nor a copy outside every lockfile's tree, even with a skippable version in its path.
      expect(isUnchangedCopy(`../${pnpmCopy('7.0.0')}`, 'is-number')).toBe(false);
    });

    it('reads a hoisted copy from disk, and traces it when it cannot tell its version', async () => {
      const lockfile = pnpmLockfile('is-number@7.0.0', 'is-number@6.0.0');
      mockWorkspace(addsNestedCopy);
      mockPnpmLockfile(lockfile, {
        '/root/node_modules/is-number/package.json': '{"name":"is-number","version":"7.0.0"}',
      });
      const onDisk = await findChangedDependencies(getStatsContext(), stats(...uiModules));
      expect(onDisk.isUnchangedCopy('node_modules/is-number', 'is-number')).toBe(true);

      mockWorkspace(addsNestedCopy);
      mockPnpmLockfile(lockfile);
      const unknown = await findChangedDependencies(getStatsContext(), stats(...uiModules));
      expect(unknown.isUnchangedCopy('node_modules/is-number', 'is-number')).toBe(false);
    });

    it('traces every copy of a package when a version of it was removed', async () => {
      // Whatever loaded is-number@6 now loads is-number@7, which was already installed elsewhere.
      mockWorkspace({
        'packages/ui': {
          name: '@myorg/ui',
          head: ['react@19.0.1', 'is-number@7.0.0'],
          base: ['react@19.0.1', 'is-number@7.0.0', 'is-number@6.0.0'],
        },
      });
      mockPnpmLockfile(pnpmLockfile('react@19.0.1', 'is-number@7.0.0'));

      const { names, isUnchangedCopy } = await findChangedDependencies(
        getStatsContext(),
        stats(...uiModules)
      );
      expect(names).toEqual(['is-number']);
      expect(isUnchangedCopy(pnpmCopy('7.0.0'), 'is-number')).toBe(false);
    });

    it('traces every copy of a package the lockfile installs from outside the registry', async () => {
      mockWorkspace(addsNestedCopy);
      mockPnpmLockfile(pnpmLockfile('is-number@7.0.0', 'is-number@file:vendor/is-number'));

      const { isUnchangedCopy } = await findChangedDependencies(
        getStatsContext(),
        stats(...uiModules)
      );
      expect(isUnchangedCopy(pnpmCopy('7.0.0'), 'is-number')).toBe(false);
    });
  });

  it('throws when the baseline lockfile is missing, even if the manifest is too', async () => {
    mockWorkspace({ 'packages/ui': { name: '@myorg/ui', head: ['react@19.0.1'] } });
    const error = new BaselineCheckoutFailedError('A:pnpm-lock.yaml', { fileMissing: true });
    checkoutFile.mockImplementation(async (_, reference, file) => {
      if (file === 'pnpm-lock.yaml') throw error;
      if (file === 'packages/ui/package.json') {
        throw new BaselineCheckoutFailedError(`${reference}:${file}`, { fileMissing: true });
      }
    });

    // A bail reaches Sentry under the same error name as before added workspaces were handled.
    await expect(
      findChangedDependencies(getStatsContext(), stats(...uiModules))
    ).rejects.toMatchObject({
      name: 'BaselineCheckoutFailedError',
      message: 'Failed to check out baseline file: A:pnpm-lock.yaml',
    });
  });

  it('throws when a manifest that may exist at the baseline cannot be checked out', async () => {
    mockWorkspace({ 'packages/ui': { name: '@myorg/ui', head: ['react@19.0.1'] } });
    const error = new BaselineCheckoutFailedError('A:packages/ui/package.json');
    checkoutFile.mockImplementation(async (_, __, file) => {
      if (file === 'packages/ui/package.json') throw error;
    });

    await expect(changedNames(getStatsContext(), stats(...uiModules))).rejects.toBe(error);
  });
});
