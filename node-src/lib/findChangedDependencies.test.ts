/* eslint-disable max-lines */
import snykGraph from '@snyk/dep-graph';
import { mkdtempSync as unMockedMkdtempSync, statSync as unMockedStatSync } from 'fs';
import { buildDepTreeFromFiles } from 'snyk-nodejs-lockfile-parser';
import snyk from 'snyk-nodejs-plugin';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';

import { Context } from '..';
import * as git from '../git/git';
import { findChangedDependencies } from './findChangedDependencies';
import TestLogger from './testLogger';

vi.mock('snyk-nodejs-lockfile-parser');
vi.mock('snyk-nodejs-plugin');
vi.mock('@snyk/dep-graph');
vi.mock('yarn-or-npm');
vi.mock('../git/git');
vi.mock('fs');

const tmpdir = '/tmpdir';

const statSync = unMockedStatSync as Mock;
statSync.mockReturnValue({ size: 1 });

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
  findFilesFromRepositoryRoot.mockImplementation((file) =>
    Promise.resolve(file.startsWith('**') ? [] : [file])
  );
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
    ...input,
  }) as Context;

const AMetadataChanges = [{ changedFiles: ['package.json'], commit: 'A' }];

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
    checkoutFile.mockResolvedValueOnce('A.package.json');
    checkoutFile.mockResolvedValueOnce('A.yarn.lock');
    inspect.mockResolvedValue({
      scannedProjects: [
        {
          depGraph: {
            getDepPkgs: () => [{ name: 'react', version: '18.2.0', dependencies: {} }],
          },
        },
      ],
    } as any);
    createChangedPackagesGraph.mockResolvedValue({
      getDepPkgs: () => [],
    } as any);

    const context = getContext({ git: { packageMetadataChanges: AMetadataChanges } });

    await expect(findChangedDependencies(context)).resolves.toEqual([]);
  });

  it('returns nothing when dependency tree is empty', async () => {
    checkoutFile.mockResolvedValueOnce('A.package.json');
    checkoutFile.mockResolvedValueOnce('A.yarn.lock');
    buildDepTree.mockResolvedValue({ dependencies: {} });
    inspect.mockResolvedValue({
      scannedProjects: [
        {
          depGraph: {
            getDepPkgs: () => [],
          },
        },
      ],
    } as any);
    createChangedPackagesGraph.mockResolvedValue({
      getDepPkgs: () => [],
    } as any);

    const context = getContext({ git: { packageMetadataChanges: AMetadataChanges } });

    await expect(findChangedDependencies(context)).resolves.toEqual([]);
  });

  it('returns nothing when dependency tree is unchanged', async () => {
    checkoutFile.mockResolvedValueOnce('A.package.json');
    checkoutFile.mockResolvedValueOnce('A.yarn.lock');
    inspect.mockResolvedValue({
      scannedProjects: [
        {
          depGraph: {
            getDepPkgs: () => [{ name: 'react', version: '18.2.0', dependencies: {} }],
          },
        },
      ],
    } as any);
    createChangedPackagesGraph.mockResolvedValue({
      getDepPkgs: () => [],
    } as any);

    const context = getContext({ git: { packageMetadataChanges: AMetadataChanges } });

    await expect(findChangedDependencies(context)).resolves.toEqual([]);
  });

  it('returns updated dependencies', async () => {
    // HEAD
    inspect.mockResolvedValueOnce({
      scannedProjects: [
        {
          depGraph: {
            getDepPkgs: () => [{ name: 'react', version: '18.2.0', dependencies: {} }],
          },
        },
      ],
    } as any);

    // Baseline A
    checkoutFile.mockResolvedValueOnce('A.package.json');
    checkoutFile.mockResolvedValueOnce('A.yarn.lock');
    inspect.mockResolvedValueOnce({
      scannedProjects: [
        {
          depGraph: { getDepPkgs: () => [{ name: 'react', version: '18.3.0', dependencies: {} }] },
        },
      ],
    } as any);
    createChangedPackagesGraph.mockResolvedValue({
      getDepPkgs: () => [{ name: 'react', version: '18.3.0', dependencies: {} }],
    } as any);

    const context = getContext({ git: { packageMetadataChanges: AMetadataChanges } });

    await expect(findChangedDependencies(context)).resolves.toEqual(['react']);
  });

  it('returns added/removed dependencies', async () => {
    // HEAD
    inspect.mockResolvedValueOnce({
      scannedProjects: [
        {
          depGraph: { getDepPkgs: () => [{ name: 'react', version: '18.2.0', dependencies: {} }] },
        },
      ],
    } as any);

    // Baseline A
    checkoutFile.mockResolvedValueOnce('A.package.json');
    checkoutFile.mockResolvedValueOnce('A.yarn.lock');
    inspect.mockResolvedValueOnce({
      scannedProjects: [
        {
          depGraph: { getDepPkgs: () => [{ name: 'vue', version: '3.2.0', dependencies: {} }] },
        },
      ],
    } as any);
    createChangedPackagesGraph.mockResolvedValue({
      getDepPkgs: () => [
        { name: 'vue', version: '3.2.0', dependencies: {} },
        { name: 'react', version: '18.2.0', dependencies: {} },
      ],
    } as any);

    const context = getContext({ git: { packageMetadataChanges: AMetadataChanges } });

    await expect(findChangedDependencies(context)).resolves.toEqual(['vue', 'react']);
  });

  it('finds updated transient dependencies', async () => {
    // HEAD
    inspect.mockResolvedValueOnce({
      scannedProjects: [
        {
          depGraph: {
            getDepPkgs: () => [
              {
                name: 'react',
                version: '18.2.0',
                dependencies: {
                  'loose-envify': { name: 'loose-envify', version: '1.3.1', dependencies: {} },
                },
              },
            ],
          },
        },
      ],
    } as any);

    // Baseline A
    checkoutFile.mockResolvedValueOnce('A.package.json');
    checkoutFile.mockResolvedValueOnce('A.yarn.lock');
    inspect.mockResolvedValueOnce({
      scannedProjects: [
        {
          depGraph: {
            getDepPkgs: () => [
              {
                name: 'react',
                version: '18.2.0',
                dependencies: { 'loose-envify': { name: 'loose-envify', version: '1.4.0' } },
              },
            ],
          },
        },
      ],
    } as any);
    createChangedPackagesGraph.mockResolvedValue({
      getDepPkgs: () => [{ name: 'loose-envify', version: '1.4.0', dependencies: {} }],
    } as any);

    const context = getContext({ git: { packageMetadataChanges: AMetadataChanges } });

    await expect(findChangedDependencies(context)).resolves.toEqual(['loose-envify']);
  });

  it('combines and dedupes changes for multiple baselines', async () => {
    // HEAD
    inspect.mockResolvedValueOnce({
      scannedProjects: [
        {
          depGraph: {
            getDepPkgs: () => [
              { name: 'react', version: '18.2.0', dependencies: {} },
              { name: 'lodash', version: '4.17.21', dependencies: {} },
            ],
          },
        },
      ],
    } as any);

    // Baseline A
    checkoutFile.mockResolvedValueOnce('A.package.json');
    checkoutFile.mockResolvedValueOnce('A.yarn.lock');
    inspect.mockResolvedValueOnce({
      scannedProjects: [
        {
          depGraph: {
            getDepPkgs: () => [
              {
                name: 'react',
                version: '18.3.0',
                dependencies: {},
              },
              {
                name: 'lodash',
                version: '4.17.3',
                dependencies: {},
              },
            ],
          },
        },
      ],
    } as any);

    // Baseline B
    checkoutFile.mockResolvedValueOnce('B.package.json');
    checkoutFile.mockResolvedValueOnce('B.yarn.lock');
    inspect.mockResolvedValueOnce({
      scannedProjects: [
        {
          depGraph: {
            getDepPkgs: () => [
              {
                name: 'react',
                version: '18.3.0',
                dependencies: {},
              },
              {
                name: 'lodash',
                version: '4.18.0',
                dependencies: {},
              },
            ],
          },
        },
      ],
    } as any);
    createChangedPackagesGraph.mockResolvedValue({
      getDepPkgs: () => [
        { name: 'react', version: '18.3.0', dependencies: {} },
        { name: 'lodash', version: '4.18.0', dependencies: {} },
      ],
    } as any);

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
    findFilesFromRepositoryRoot.mockImplementation((file) =>
      Promise.resolve(file.startsWith('**') ? [file.replace('**', 'subdir')] : [file])
    );

    // HEAD root
    inspect.mockResolvedValueOnce({
      scannedProjects: [
        {
          depGraph: { getDepPkgs: () => [{ name: 'react', version: '18.2.0', dependencies: {} }] },
        },
      ],
    } as any);
    // HEAD subdir
    inspect.mockResolvedValueOnce({
      scannedProjects: [
        {
          depGraph: {
            getDepPkgs: () => [{ name: 'lodash', version: '4.17.21', dependencies: {} }],
          },
        },
      ],
    } as any);

    // Baseline A
    checkoutFile.mockImplementation((_ctx, commit, file) => Promise.resolve(`${commit}.${file}`));
    inspect.mockResolvedValueOnce({
      scannedProjects: [
        {
          depGraph: { getDepPkgs: () => [{ name: 'react', version: '18.3.0', dependencies: {} }] },
        },
      ],
    } as any);
    inspect.mockResolvedValueOnce({
      scannedProjects: [
        {
          depGraph: { getDepPkgs: () => [{ name: 'lodash', version: '4.18.0', dependencies: {} }] },
        },
      ],
    } as any);
    createChangedPackagesGraph.mockResolvedValue({
      getDepPkgs: () => [
        { name: 'react', version: '18.3.0', dependencies: {} },
        { name: 'lodash', version: '4.18.0', dependencies: {} },
      ],
    } as any);

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
    findFilesFromRepositoryRoot.mockImplementation((file) => {
      if (file === 'subdir/yarn.lock') return Promise.resolve([]);
      return Promise.resolve(file.startsWith('**') ? [file.replace('**', 'subdir')] : [file]);
    });

    checkoutFile.mockImplementation((_ctx, commit, file) => Promise.resolve(`${commit}.${file}`));
    inspect.mockResolvedValue({
      scannedProjects: [{ depGraph: { getDepPkgs: () => [] } }],
    } as any);
    createChangedPackagesGraph.mockResolvedValue({
      getDepPkgs: () => [],
    } as any);

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
    findFilesFromRepositoryRoot.mockImplementation((file) => {
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
    findFilesFromRepositoryRoot.mockImplementation((file) => {
      if (file.endsWith('yarn.lock'))
        return Promise.resolve([file.replace('yarn.lock', 'package-lock.json')]);
      return Promise.resolve(file.startsWith('**') ? [file.replace('**', 'subdir')] : [file]);
    });

    checkoutFile.mockImplementation((_ctx, commit, file) => Promise.resolve(`${commit}.${file}`));
    inspect.mockResolvedValue({
      scannedProjects: [{ depGraph: { getDepPkgs: () => [] } }],
    } as any);
    createChangedPackagesGraph.mockResolvedValue({
      getDepPkgs: () => [],
    } as any);

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
});
