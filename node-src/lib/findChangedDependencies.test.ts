import { buildDepTreeFromFiles } from 'snyk-nodejs-lockfile-parser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as git from '../git/git';
import { findChangedDependencies } from './findChangedDependencies';
import TestLogger from './testLogger';
import { Context } from '..';

vi.mock('snyk-nodejs-lockfile-parser');
vi.mock('yarn-or-npm');
vi.mock('../git/git');

const getRepositoryRoot = vi.mocked(git.getRepositoryRoot);
const checkoutFile = vi.mocked(git.checkoutFile);
const findFilesFromRepositoryRoot = vi.mocked(git.findFilesFromRepositoryRoot);
const buildDepTree = vi.mocked(buildDepTreeFromFiles);

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
  } as Context);

const AMetadataChanges = [{ changedFiles: ['package.json'], commit: 'A' }];

describe('findChangedDependencies', () => {
  it('returns nothing given no changes', async () => {
    const context = getContext({ git: { packageMetadataChanges: [] } });

    await expect(findChangedDependencies(context)).resolves.toEqual([]);
    expect(checkoutFile).not.toHaveBeenCalled();
    expect(buildDepTreeFromFiles).not.toHaveBeenCalled();
  });

  it('returns nothing given no changes to found package metadata', async () => {
    const context = getContext({
      // Only detected metadata change is to a file that's not on disk
      git: { packageMetadataChanges: [{ changedFiles: ['foo/package.json'], commit: 'A' }] },
    });

    await expect(findChangedDependencies(context)).resolves.toEqual([]);

    expect(checkoutFile).not.toHaveBeenCalled();
    expect(buildDepTreeFromFiles).not.toHaveBeenCalled();
  });

  it('returns nothing when dependency tree is unchanged', async () => {
    checkoutFile.mockResolvedValueOnce('A.package.json');
    checkoutFile.mockResolvedValueOnce('A.yarn.lock');
    buildDepTree.mockResolvedValue({
      dependencies: {
        react: { name: 'react', version: '18.2.0', dependencies: {} },
      },
    });

    const context = getContext({ git: { packageMetadataChanges: AMetadataChanges } });

    await expect(findChangedDependencies(context)).resolves.toEqual([]);
  });

  it('returns nothing when dependency tree is empty', async () => {
    checkoutFile.mockResolvedValueOnce('A.package.json');
    checkoutFile.mockResolvedValueOnce('A.yarn.lock');
    buildDepTree.mockResolvedValue({ dependencies: {} });

    const context = getContext({ git: { packageMetadataChanges: AMetadataChanges } });

    await expect(findChangedDependencies(context)).resolves.toEqual([]);
  });

  it('returns nothing when dependency tree is unchanged', async () => {
    checkoutFile.mockResolvedValueOnce('A.package.json');
    checkoutFile.mockResolvedValueOnce('A.yarn.lock');
    buildDepTree.mockResolvedValue({
      dependencies: {
        react: { name: 'react', version: '18.2.0', dependencies: {} },
      },
    });

    const context = getContext({ git: { packageMetadataChanges: AMetadataChanges } });

    await expect(findChangedDependencies(context)).resolves.toEqual([]);
  });

  it('returns updated dependencies', async () => {
    // HEAD
    buildDepTree.mockResolvedValueOnce({
      dependencies: { react: { name: 'react', version: '18.2.0', dependencies: {} } },
    });

    // Baseline A
    checkoutFile.mockResolvedValueOnce('A.package.json');
    checkoutFile.mockResolvedValueOnce('A.yarn.lock');
    buildDepTree.mockResolvedValueOnce({
      dependencies: { react: { name: 'react', version: '18.3.0', dependencies: {} } },
    });

    const context = getContext({ git: { packageMetadataChanges: AMetadataChanges } });

    await expect(findChangedDependencies(context)).resolves.toEqual(['react']);
  });

  it('returns added/removed dependencies', async () => {
    // HEAD
    buildDepTree.mockResolvedValueOnce({
      dependencies: { react: { name: 'react', version: '18.2.0', dependencies: {} } },
    });

    // Baseline A
    checkoutFile.mockResolvedValueOnce('A.package.json');
    checkoutFile.mockResolvedValueOnce('A.yarn.lock');
    buildDepTree.mockResolvedValueOnce({
      dependencies: { vue: { name: 'vue', version: '3.2.0', dependencies: {} } },
    });

    const context = getContext({ git: { packageMetadataChanges: AMetadataChanges } });

    await expect(findChangedDependencies(context)).resolves.toEqual(['vue', 'react']);
  });

  it('finds updated transient dependencies', async () => {
    // HEAD
    buildDepTree.mockResolvedValueOnce({
      dependencies: {
        react: {
          name: 'react',
          version: '18.2.0',
          dependencies: {
            'loose-envify': { name: 'loose-envify', version: '1.3.1', dependencies: {} },
          },
        },
      },
    });

    // Baseline A
    checkoutFile.mockResolvedValueOnce('A.package.json');
    checkoutFile.mockResolvedValueOnce('A.yarn.lock');
    buildDepTree.mockResolvedValueOnce({
      dependencies: {
        react: {
          name: 'react',
          version: '18.2.0',
          dependencies: {
            'loose-envify': { name: 'loose-envify', version: '1.4.0', dependencies: {} },
          },
        },
      },
    });

    const context = getContext({ git: { packageMetadataChanges: AMetadataChanges } });

    await expect(findChangedDependencies(context)).resolves.toEqual(['loose-envify']);
  });

  it('combines and dedupes changes for multiple baselines', async () => {
    // HEAD
    buildDepTree.mockResolvedValueOnce({
      dependencies: {
        react: { name: 'react', version: '18.2.0', dependencies: {} },
        lodash: { name: 'lodash', version: '4.17.21', dependencies: {} },
      },
    });

    // Baseline A
    checkoutFile.mockResolvedValueOnce('A.package.json');
    checkoutFile.mockResolvedValueOnce('A.yarn.lock');
    buildDepTree.mockResolvedValueOnce({
      dependencies: {
        react: { name: 'react', version: '18.3.0', dependencies: {} },
        lodash: { name: 'lodash', version: '4.17.21', dependencies: {} },
      },
    });

    // Baseline B
    checkoutFile.mockResolvedValueOnce('B.package.json');
    checkoutFile.mockResolvedValueOnce('B.yarn.lock');
    buildDepTree.mockResolvedValueOnce({
      dependencies: {
        react: { name: 'react', version: '18.3.0', dependencies: {} },
        lodash: { name: 'lodash', version: '4.18.0', dependencies: {} },
      },
    });

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
    buildDepTree.mockResolvedValueOnce({
      dependencies: { react: { name: 'react', version: '18.2.0', dependencies: {} } },
    });
    // HEAD subdir
    buildDepTree.mockResolvedValueOnce({
      dependencies: { lodash: { name: 'lodash', version: '4.17.21', dependencies: {} } },
    });

    // Baseline A
    checkoutFile.mockImplementation((ctx, commit, file) => Promise.resolve(`${commit}.${file}`));
    buildDepTree.mockResolvedValueOnce({
      dependencies: { react: { name: 'react', version: '18.3.0', dependencies: {} } },
    });
    buildDepTree.mockResolvedValueOnce({
      dependencies: { lodash: { name: 'lodash', version: '4.18.0', dependencies: {} } },
    });

    const context = getContext({
      git: {
        packageMetadataChanges: [
          { changedFiles: ['package.json', 'subdir/package.json'], commit: 'A' },
        ],
      },
    });

    await expect(findChangedDependencies(context)).resolves.toEqual(['react', 'lodash']);

    // Root manifest and lock files are checked
    expect(buildDepTree).toHaveBeenCalledWith('/root', 'package.json', 'yarn.lock', true, false);
    expect(buildDepTree).toHaveBeenCalledWith(
      '/root',
      'A.package.json',
      'A.yarn.lock',
      true,
      false
    );

    // Subpackage manifest and lock files are checked
    expect(buildDepTree).toHaveBeenCalledWith(
      '/root',
      'subdir/package.json',
      'subdir/yarn.lock',
      true,
      false
    );
    expect(buildDepTree).toHaveBeenCalledWith(
      '/root',
      'A.subdir/package.json',
      'A.subdir/yarn.lock',
      true,
      false
    );
  });

  it('uses root lockfile when subpackage lockfile is missing', async () => {
    findFilesFromRepositoryRoot.mockImplementation((file) => {
      if (file === 'subdir/yarn.lock') return Promise.resolve([]);
      return Promise.resolve(file.startsWith('**') ? [file.replace('**', 'subdir')] : [file]);
    });

    checkoutFile.mockImplementation((ctx, commit, file) => Promise.resolve(`${commit}.${file}`));
    buildDepTree.mockResolvedValue({ dependencies: {} });

    const context = getContext({
      git: {
        packageMetadataChanges: [{ changedFiles: ['yarn.lock'], commit: 'A' }],
      },
    });

    await expect(findChangedDependencies(context)).resolves.toEqual([]);

    expect(buildDepTree).toHaveBeenCalledWith(
      '/root',
      'A.subdir/package.json',
      'A.yarn.lock', // root lockfile
      true,
      false
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

    expect(checkoutFile).not.to.toHaveBeenCalled();
    expect(buildDepTree).not.toHaveBeenCalled();
  });

  it('uses package-lock.json if yarn.lock is missing', async () => {
    findFilesFromRepositoryRoot.mockImplementation((file) => {
      if (file.endsWith('yarn.lock'))
        return Promise.resolve([file.replace('yarn.lock', 'package-lock.json')]);
      return Promise.resolve(file.startsWith('**') ? [file.replace('**', 'subdir')] : [file]);
    });

    checkoutFile.mockImplementation((ctx, commit, file) => Promise.resolve(`${commit}.${file}`));
    buildDepTree.mockResolvedValue({ dependencies: {} });

    const context = getContext({
      git: {
        packageMetadataChanges: [{ changedFiles: ['subdir/package-lock.json'], commit: 'A' }],
      },
    });

    await expect(findChangedDependencies(context)).resolves.toEqual([]);

    expect(buildDepTree).toHaveBeenCalledWith(
      '/root',
      'A.subdir/package.json',
      'A.subdir/package-lock.json',
      true,
      false
    );
  });
});
