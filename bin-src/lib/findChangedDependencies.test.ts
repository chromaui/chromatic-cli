import { buildDepTreeFromFiles } from 'snyk-nodejs-lockfile-parser';
import { findChangedDependencies } from './findChangedDependencies';
import * as git from '../git/git';
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

const getContext: any = (baselineCommits: string[]) => ({
  log: new TestLogger(),
  git: { baselineCommits },
});

describe('findChangedDependencies', () => {
  it('returns nothing given no baselines', async () => {
    buildDepTree.mockResolvedValue({ dependencies: {} });

    await expect(findChangedDependencies(getContext([]))).resolves.toEqual([]);
  });

  it('returns nothing when dependency tree is empty', async () => {
    checkoutFile.mockResolvedValueOnce('A.package.json');
    checkoutFile.mockResolvedValueOnce('A.package-lock.json');
    buildDepTree.mockResolvedValue({ dependencies: {} });

    await expect(findChangedDependencies(getContext(['A']))).resolves.toEqual([]);
  });

  it('returns nothing when dependency tree is unchanged', async () => {
    checkoutFile.mockResolvedValueOnce('A.package.json');
    checkoutFile.mockResolvedValueOnce('A.package-lock.json');
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
    checkoutFile.mockResolvedValueOnce('A.package-lock.json');
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
    checkoutFile.mockResolvedValueOnce('A.package-lock.json');
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
    checkoutFile.mockResolvedValueOnce('A.package-lock.json');
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
    checkoutFile.mockResolvedValueOnce('A.package-lock.json');
    buildDepTree.mockResolvedValueOnce({
      dependencies: {
        react: { name: 'react', version: '18.3.0', dependencies: {} },
        lodash: { name: 'lodash', version: '4.17.21', dependencies: {} },
      },
    });

    // Baseline B
    checkoutFile.mockResolvedValueOnce('B.package.json');
    checkoutFile.mockResolvedValueOnce('B.package-lock.json');
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
    expect(buildDepTree).toHaveBeenCalledWith('/root', 'package.json', 'package-lock.json', true);
    expect(buildDepTree).toHaveBeenCalledWith(
      '/root',
      'A.package.json',
      'A.package-lock.json',
      true
    );

    // Subpackage manifest and lock files are checked
    expect(buildDepTree).toHaveBeenCalledWith(
      '/root',
      'subdir/package.json',
      'subdir/package-lock.json',
      true
    );
    expect(buildDepTree).toHaveBeenCalledWith(
      '/root',
      'A.subdir/package.json',
      'A.subdir/package-lock.json',
      true
    );
  });

  it('uses root lockfile when subpackage lockfile is missing', async () => {
    findFiles.mockImplementation((file) => {
      if (file === 'subdir/package-lock.json') return Promise.resolve([]);
      return Promise.resolve(file.startsWith('**') ? [file.replace('**', 'subdir')] : [file]);
    });

    checkoutFile.mockImplementation((ctx, commit, file) => Promise.resolve(`${commit}.${file}`));
    buildDepTree.mockResolvedValue({ dependencies: {} });

    await expect(findChangedDependencies(getContext(['A']))).resolves.toEqual([]);

    expect(buildDepTree).toHaveBeenCalledWith(
      '/root',
      'A.subdir/package.json',
      'A.package-lock.json', // root lockfile
      true
    );
  });
});
