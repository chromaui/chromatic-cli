import snykGraph from '@snyk/dep-graph';
import {
  copyFileSync as unMockedCopyFileSync,
  mkdtempSync as unMockedMkdtempSync,
  readFileSync as unMockedReadFileSync,
  statSync as unMockedStatSync,
} from 'fs';
import { getPnpmLockfileParser, parsePnpmWorkspaceProject } from 'snyk-nodejs-lockfile-parser';
import snyk from 'snyk-nodejs-plugin';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';

import { Context } from '../../..';
import * as git from '../../../git/git';
import getEnvironment from '../../getEnvironment';
import TestLogger from '../../testLogger';
import { LockFileMissingError } from './errors';
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

// Emulates `git ls-files` over the given tracked files: a `**/` pattern matches the name in any
// subdirectory (but not the root), other patterns match exactly, and results come back sorted the
// way the git index is.
function mockTrackedFiles(files: string[]) {
  findFilesFromRepositoryRoot.mockImplementation((_, __, ...patterns) =>
    Promise.resolve(
      files
        .toSorted()
        .filter((file) =>
          patterns.some((pattern) =>
            pattern.startsWith('**/') ? file.endsWith(pattern.slice(2)) : file === pattern
          )
        )
    )
  );
}

beforeEach(() => {
  getRepositoryRoot.mockResolvedValue('/root');
  mockTrackedFiles(['package.json', 'yarn.lock']);
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
    mockTrackedFiles(['package.json', 'yarn.lock', 'subdir/package.json', 'subdir/yarn.lock']);

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
    mockTrackedFiles(['package.json', 'yarn.lock', 'subdir/package.json']);

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
    mockTrackedFiles(['package.json', 'yarn.lock', 'subdir/package.json']);

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

  it('pairs each manifest with the lockfile in its own directory', async () => {
    mockTrackedFiles([
      'package.json',
      'yarn.lock',
      // Sorts before the root manifest in index order, without a lockfile of its own.
      '.storybook/package.json',
      // A lockfile in a deeper directory doesn't belong to this manifest.
      'packages/a/package.json',
      'packages/a/sub/yarn.lock',
      // A directory whose name starts with another's must not borrow its lockfile.
      'packages/ab/package.json',
      'packages/ab/yarn.lock',
      // With several lockfiles in one directory, the first in index order wins.
      'packages/c/package.json',
      'packages/c/yarn.lock',
      'packages/c/package-lock.json',
    ]);
    inspect.mockResolvedValue({ scannedProjects: [{ depGraph: { getDepPkgs: () => [] } }] } as any);
    mockChangedPackagesGraph([]);

    // Each manifest changed in its own baseline commit, so the files checked out for a commit are
    // that manifest and the lockfile it was paired with.
    const context = getContext({
      git: {
        packageMetadataChanges: [
          { changedFiles: ['package.json'], commit: 'root' },
          { changedFiles: ['.storybook/package.json'], commit: 'storybook' },
          { changedFiles: ['packages/a/package.json'], commit: 'a' },
          { changedFiles: ['packages/ab/package.json'], commit: 'ab' },
          { changedFiles: ['packages/c/package.json'], commit: 'c' },
        ],
      },
    });

    await expect(findChangedDependencies(context)).resolves.toEqual([]);

    const checkedOut: Record<string, string[]> = {};
    for (const [, reference, file] of checkoutFile.mock.calls) {
      (checkedOut[reference] ??= []).push(file);
    }
    expect(
      Object.fromEntries(Object.entries(checkedOut).map(([k, v]) => [k, v.toSorted()]))
    ).toEqual({
      root: ['package.json', 'yarn.lock'],
      storybook: ['.storybook/package.json', 'yarn.lock'],
      a: ['packages/a/package.json', 'yarn.lock'],
      ab: ['packages/ab/package.json', 'packages/ab/yarn.lock'],
      c: ['packages/c/package-lock.json', 'packages/c/package.json'],
    });
  });

  it('throws a named error when a changed manifest has no lockfile anywhere', async () => {
    mockTrackedFiles(['package.json', 'subdir/package.json']);

    const context = getContext({
      git: { packageMetadataChanges: [{ changedFiles: ['subdir/package.json'], commit: 'A' }] },
    });

    await expect(findChangedDependencies(context)).rejects.toThrow(LockFileMissingError);
    expect(checkoutFile).not.toHaveBeenCalled();
  });

  it('uses package-lock.json if yarn.lock is missing', async () => {
    mockTrackedFiles([
      'package.json',
      'package-lock.json',
      'subdir/package.json',
      'subdir/package-lock.json',
    ]);

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

    mockTrackedFiles(['package.json', 'package-lock.json']);

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
    // Only the root has a lockfile.
    mockTrackedFiles(['package.json', 'pnpm-lock.yaml', 'packages/ui/package.json']);
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
