import snykGraph from '@snyk/dep-graph';
import {
  copyFileSync as unMockedCopyFileSync,
  mkdtempSync as unMockedMkdtempSync,
  statSync as unMockedStatSync,
} from 'fs';
import { buildDepTreeFromFiles } from 'snyk-nodejs-lockfile-parser';
import snyk from 'snyk-nodejs-plugin';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';

import { Context } from '../..';
import * as git from '../../git/git';
import getEnvironment from '../../lib/getEnvironment';
import TestLogger from '../testLogger';
import { findChangedDependencies } from './findChangedDependencies';

vi.mock('snyk-nodejs-lockfile-parser');
vi.mock('snyk-nodejs-plugin');
vi.mock('@snyk/dep-graph');
vi.mock('yarn-or-npm');
vi.mock('../../git/git');
vi.mock('fs');

const tmpdir = '/tmpdir';

const statSync = unMockedStatSync as Mock;
statSync.mockReturnValue({ size: 1 });

const copyFileSync = unMockedCopyFileSync as Mock;
copyFileSync.mockReturnValue(undefined);

const mkdtempSync = unMockedMkdtempSync as Mock;
mkdtempSync.mockReturnValue(tmpdir);

const getRepositoryRoot = vi.mocked(git.getRepositoryRoot);
const checkoutFile = vi.mocked(git.checkoutFile);
const findFilesFromRepositoryRoot = vi.mocked(git.findFilesFromRepositoryRoot);
const buildDepTree = vi.mocked(buildDepTreeFromFiles);
const inspect = vi.mocked(snyk.inspect);
const createChangedPackagesGraph = vi.mocked(snykGraph.createChangedPackagesGraph);

beforeEach(() => {
  getRepositoryRoot.mockResolvedValue('/root');
  // always resolve files in the root, but not subdirs
  findFilesFromRepositoryRoot.mockImplementation((_, file) =>
    Promise.resolve(file.startsWith('**') ? [] : [file])
  );
  // always checkout files with the result path of "<commit>.<file>"
  checkoutFile.mockImplementation((_ctx, commit, file) => Promise.resolve(`${commit}.${file}`));
});
afterEach(() => {
  getRepositoryRoot.mockReset();
  checkoutFile.mockReset();
  findFilesFromRepositoryRoot.mockReset();
  buildDepTree.mockReset();
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
    buildDepTree.mockResolvedValue({ dependencies: {} });
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
    findFilesFromRepositoryRoot.mockImplementation((_, file) =>
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

    // Root manifest and lock files are checked
    expect(inspect).toHaveBeenCalledWith(tmpdir, `${tmpdir}/yarn.lock`, {
      dev: true,
      strictOutOfSync: false,
    });
    expect(inspect).toHaveBeenCalledWith(tmpdir, `${tmpdir}/A.yarn.lock`, {
      dev: true,
      strictOutOfSync: false,
    });

    // Subpackage manifest and lock files are checked
    expect(inspect).toHaveBeenCalledWith(tmpdir, `${tmpdir}/yarn.lock`, {
      dev: true,
      strictOutOfSync: false,
    });
    expect(inspect).toHaveBeenCalledWith(tmpdir, `${tmpdir}/A.yarn.lock`, {
      dev: true,
      strictOutOfSync: false,
    });
  });

  it('uses root lockfile when subpackage lockfile is missing', async () => {
    findFilesFromRepositoryRoot.mockImplementation((_, file) => {
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
    findFilesFromRepositoryRoot.mockImplementation((_, file) => {
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
    findFilesFromRepositoryRoot.mockImplementation((_, file) => {
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

    expect(inspect).toHaveBeenCalledWith(
      `${tmpdir}/A.subdir`,
      `${tmpdir}/A.subdir/package-lock.json`,
      {
        dev: true,
        strictOutOfSync: false,
      }
    );
  });

  it('handles relative paths correctly when copying files to temp directory', async () => {
    // Mock the repository root to be different from current working directory
    getRepositoryRoot.mockResolvedValue('/root/subdir');

    // Mock findFilesFromRepositoryRoot to return relative paths
    findFilesFromRepositoryRoot.mockImplementation((_, ...patterns) => {
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
});
