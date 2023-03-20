import { buildDepTreeFromFiles } from 'snyk-nodejs-lockfile-parser';

import * as git from '../git/git';
import { findChangedDependencies } from './findChangedDependencies';
import TestLogger from './testLogger';

jest.mock('snyk-nodejs-lockfile-parser');
jest.mock('yarn-or-npm');
jest.mock('../git/git');

const getRepositoryRoot = <jest.MockedFunction<typeof git.getRepositoryRoot>>git.getRepositoryRoot;
const checkoutFile = <jest.MockedFunction<typeof git.checkoutFile>>git.checkoutFile;
const findFiles = <jest.MockedFunction<typeof git.findFiles>>git.findFiles;
const buildDepTree = <jest.MockedFunction<typeof buildDepTreeFromFiles>>buildDepTreeFromFiles;

beforeEach(() => {
  getRepositoryRoot.mockResolvedValue('/root');
  findFiles.mockImplementation((file) => Promise.resolve(file.startsWith('**') ? [] : [file]));
});
afterEach(() => {
  getRepositoryRoot.mockReset();
  checkoutFile.mockReset();
  findFiles.mockReset();
  buildDepTree.mockReset();
});

const getContext: any = (baselineCommits: string[], options = {}) => ({
  log: new TestLogger(),
  git: { baselineCommits },
  options,
});

describe('findChangedDependencies', () => {
  it('returns nothing given no baselines', async () => {
    buildDepTree.mockResolvedValue({ dependencies: {} });

    await expect(findChangedDependencies(getContext([]))).resolves.toEqual([]);
  });

  it('returns nothing when dependency tree is empty', async () => {
    checkoutFile.mockResolvedValueOnce('A.package.json');
    checkoutFile.mockResolvedValueOnce('A.yarn.lock');
    buildDepTree.mockResolvedValue({ dependencies: {} });

    await expect(findChangedDependencies(getContext(['A']))).resolves.toEqual([]);
  });

  it('returns nothing when dependency tree is unchanged', async () => {
    checkoutFile.mockResolvedValueOnce('A.package.json');
    checkoutFile.mockResolvedValueOnce('A.yarn.lock');
    buildDepTree.mockResolvedValue({
      dependencies: {
        react: { name: 'react', version: '18.2.0', dependencies: {} },
      },
    });

    await expect(findChangedDependencies(getContext(['A']))).resolves.toEqual([]);
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

    await expect(findChangedDependencies(getContext(['A']))).resolves.toEqual(['react']);
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

    await expect(findChangedDependencies(getContext(['A']))).resolves.toEqual(['vue', 'react']);
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

    await expect(findChangedDependencies(getContext(['A']))).resolves.toEqual(['loose-envify']);
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

    await expect(findChangedDependencies(getContext(['A', 'B']))).resolves.toEqual([
      'react',
      'lodash',
    ]);
  });

  it('looks for manifest and lock files in subpackages', async () => {
    findFiles.mockImplementation((file) =>
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

    await expect(findChangedDependencies(getContext(['A']))).resolves.toEqual(['react', 'lodash']);

    // Root manifest and lock files are checked
    expect(buildDepTree).toHaveBeenCalledWith('/root', 'package.json', 'yarn.lock', true);
    expect(buildDepTree).toHaveBeenCalledWith('/root', 'A.package.json', 'A.yarn.lock', true);

    // Subpackage manifest and lock files are checked
    expect(buildDepTree).toHaveBeenCalledWith(
      '/root',
      'subdir/package.json',
      'subdir/yarn.lock',
      true
    );
    expect(buildDepTree).toHaveBeenCalledWith(
      '/root',
      'A.subdir/package.json',
      'A.subdir/yarn.lock',
      true
    );
  });

  it('uses root lockfile when subpackage lockfile is missing', async () => {
    findFiles.mockImplementation((file) => {
      if (file === 'subdir/yarn.lock') return Promise.resolve([]);
      return Promise.resolve(file.startsWith('**') ? [file.replace('**', 'subdir')] : [file]);
    });

    checkoutFile.mockImplementation((ctx, commit, file) => Promise.resolve(`${commit}.${file}`));
    buildDepTree.mockResolvedValue({ dependencies: {} });

    await expect(findChangedDependencies(getContext(['A']))).resolves.toEqual([]);

    expect(buildDepTree).toHaveBeenCalledWith(
      '/root',
      'A.subdir/package.json',
      'A.yarn.lock', // root lockfile
      true
    );
  });

  it('uses package-lock.json if yarn.lock is missing', async () => {
    findFiles.mockImplementation((file) => {
      if (file.endsWith('yarn.lock'))
        return Promise.resolve([file.replace('yarn.lock', 'package-lock.json')]);
      return Promise.resolve(file.startsWith('**') ? [file.replace('**', 'subdir')] : [file]);
    });

    checkoutFile.mockImplementation((ctx, commit, file) => Promise.resolve(`${commit}.${file}`));
    buildDepTree.mockResolvedValue({ dependencies: {} });

    await expect(findChangedDependencies(getContext(['A']))).resolves.toEqual([]);

    expect(buildDepTree).toHaveBeenCalledWith(
      '/root',
      'A.subdir/package.json',
      'A.subdir/package-lock.json',
      true
    );
  });

  it('ignores manifest files matching --untraced', async () => {
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

    const ctx = getContext(['A'], { untraced: ['package.json'] });
    await expect(findChangedDependencies(ctx)).resolves.toEqual([]);
  });

  it('ignores lockfiles matching --untraced', async () => {
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

    const ctx = getContext(['A'], { untraced: ['yarn.lock'] });
    await expect(findChangedDependencies(ctx)).resolves.toEqual([]);
  });

  it('resolves with changed dependencies even if we fail to checkout a file', async () => {
    findFiles.mockImplementation((file) =>
      Promise.resolve(
        file.startsWith('**')
          ? [
              file.replace('**', 'subdir'),
              file.replace('**', 'A.subdir'),
              file.replace('**', 'B.subdir'),
            ]
          : [file]
      )
    );

    buildDepTree.mockResolvedValueOnce({
      dependencies: { react: { name: 'react', version: '18.2.0', dependencies: {} } },
    });

    checkoutFile.mockImplementation((ctx, commit, file) =>
      commit === 'A' ? Promise.reject() : Promise.resolve(`${commit}.${file}`)
    );
    buildDepTree.mockResolvedValueOnce({
      dependencies: {
        react: { name: 'react', version: '18.3.0', dependencies: {} },
        lodash: { name: 'lodash', version: '4.18.0', dependencies: {} },
      },
    });

    buildDepTree.mockResolvedValueOnce({
      dependencies: {
        react: { name: 'react', version: '18.3.0', dependencies: {} },
        lodash: { name: 'lodash', version: '4.19.0', dependencies: {} },
      },
    });

    buildDepTree.mockResolvedValueOnce({
      dependencies: {
        react: { name: 'react', version: '18.3.0', dependencies: {} },
        lodash: { name: 'lodash', version: '4.18.0', dependencies: {} },
      },
    });

    buildDepTree.mockResolvedValueOnce({
      dependencies: {
        react: { name: 'react', version: '18.3.0', dependencies: {} },
        lodash: { name: 'lodash', version: '4.19.0', dependencies: {} },
      },
    });

    await expect(
      findChangedDependencies(getContext(['A', 'B'], { untraced: ['package.json'] }))
    ).resolves.toEqual(['react', 'lodash']);

    expect(buildDepTree).toBeCalledTimes(6);
    expect(buildDepTree).not.toHaveBeenCalledWith('/root', 'package.json', 'yarn.lock', true);
    // Subpackage manifest and lock files are checked
    expect(buildDepTree).toHaveBeenCalledWith(
      '/root',
      'A.subdir/package.json',
      'A.subdir/yarn.lock',
      true
    );
    expect(buildDepTree).toHaveBeenCalledWith(
      '/root',
      'B.subdir/package.json',
      'B.subdir/yarn.lock',
      true
    );
    expect(buildDepTree).toHaveBeenCalledWith(
      '/root',
      'subdir/package.json',
      'subdir/yarn.lock',
      true
    );
  });
});
