import { buildDepTreeFromFiles, PkgTree } from 'snyk-nodejs-lockfile-parser';
import { findChangedDependencies } from './findChangedDependencies';
import * as git from '../git/git';

jest.mock('snyk-nodejs-lockfile-parser');
jest.mock('../git/git');

const buildDepTree = <jest.MockedFunction<typeof buildDepTreeFromFiles>>buildDepTreeFromFiles;
const checkoutFile = <jest.MockedFunction<typeof git.checkoutFile>>git.checkoutFile;

describe('findChangedDependencies', () => {
  it('returns nothing given no baselines', async () => {
    buildDepTree.mockResolvedValue({ dependencies: {} });

    await expect(findChangedDependencies([])).resolves.toEqual([]);
  });

  it('returns nothing when dependency tree is empty', async () => {
    checkoutFile.mockResolvedValueOnce('A.package.json');
    checkoutFile.mockResolvedValueOnce('A.package-lock.json');
    buildDepTree.mockResolvedValue({ dependencies: {} });

    await expect(findChangedDependencies(['A'])).resolves.toEqual([]);
  });

  it('returns nothing when dependency tree is unchanged', async () => {
    checkoutFile.mockResolvedValueOnce('A.package.json');
    checkoutFile.mockResolvedValueOnce('A.package-lock.json');
    buildDepTree.mockResolvedValue({
      dependencies: {
        react: { name: 'react', version: '18.2.0', dependencies: {} },
      },
    });

    await expect(findChangedDependencies(['A'])).resolves.toEqual([]);
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

    await expect(findChangedDependencies(['A'])).resolves.toEqual(['react']);
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

    await expect(findChangedDependencies(['A'])).resolves.toEqual(['vue', 'react']);
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

    await expect(findChangedDependencies(['A'])).resolves.toEqual(['loose-envify']);
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

    await expect(findChangedDependencies(['A', 'B'])).resolves.toEqual(['react', 'lodash']);
  });
});
