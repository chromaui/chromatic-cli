import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as git from '../git/git';
import {
  arePackageDependenciesEqual,
  clearFileCache,
  findChangedPackageFiles,
} from './findChangedPackageFiles';

vi.mock('../git/git');

const execGitCommand = vi.mocked(git.execGitCommand);

const mockFileContents = (packagesCommitsByFile) => {
  execGitCommand.mockImplementation(async (input) => {
    const regexResults = /show\s([^:]*):(.*)/g.exec(input);
    const commit = regexResults[1];
    const fileName = regexResults[2];

    const packageObject = packagesCommitsByFile[fileName][commit];

    return JSON.stringify(packageObject);
  });
};

beforeEach(() => {
  execGitCommand.mockReset();
  clearFileCache();
});

describe('findChangedPackageFiles', () => {
  it('returns empty array when there are no changed package files', async () => {
    expect(await findChangedPackageFiles([])).toStrictEqual([]);
  });

  it('returns empty array when there are package files with no changed dependencies', async () => {
    mockFileContents({
      'package.json': { A: { dependencies: { a: '1' } }, HEAD: { dependencies: { a: '1' } } },
    });

    expect(
      await findChangedPackageFiles([{ commit: 'A', changedFiles: ['package.json'] }])
    ).toStrictEqual([]);
  });

  it('returns array with single item when there is one dependency-changed package file', async () => {
    mockFileContents({
      'package.json': { A: { dependencies: { a: '1' } }, HEAD: { dependencies: { a: '2' } } },
    });

    expect(
      await findChangedPackageFiles([{ commit: 'A', changedFiles: ['package.json'] }])
    ).toStrictEqual(['package.json']);
  });

  it('returns array with multilple items when there are multiple dependency-changed package files', async () => {
    mockFileContents({
      'package.json': { A: { dependencies: { a: '1' } }, HEAD: { dependencies: { a: '2' } } },
      'src/another/package.json': {
        A: { dependencies: { b: '3' } },
        HEAD: { dependencies: { b: '4' } },
      },
    });

    expect(
      await findChangedPackageFiles([
        { commit: 'A', changedFiles: ['package.json', 'src/another/package.json'] },
      ])
    ).toStrictEqual(['package.json', 'src/another/package.json']);
  });

  it('returns array with single item when there are multiple package files but only one has dependency changes', async () => {
    mockFileContents({
      // same deps
      'package.json': { A: { dependencies: { a: '1' } }, HEAD: { dependencies: { a: '1' } } },
      // different deps
      'src/another/package.json': {
        A: { dependencies: { b: '3' } },
        HEAD: { dependencies: { b: '4' } },
      },
    });

    expect(
      await findChangedPackageFiles([
        { commit: 'A', changedFiles: ['package.json', 'src/another/package.json'] },
      ])
    ).toStrictEqual(['src/another/package.json']);
  });

  it('returns item when last baseline commit has the package dependency change', async () => {
    mockFileContents({
      'package.json': {
        A: { dependencies: { a: '2' } },
        B: { dependencies: { a: '1' } },
        HEAD: { dependencies: { a: '2' } },
      },
    });

    expect(
      await findChangedPackageFiles([
        { commit: 'A', changedFiles: [] },
        { commit: 'B', changedFiles: ['package.json'] },
      ])
    ).toStrictEqual(['package.json']);
  });

  it('returns item when first baseline commit has the package dependency change', async () => {
    mockFileContents({
      'package.json': {
        A: { dependencies: { a: '1' } },
        B: { dependencies: { a: '2' } },
        HEAD: { dependencies: { a: '2' } },
      },
    });

    expect(
      await findChangedPackageFiles([
        { commit: 'A', changedFiles: ['package.json'] },
        { commit: 'B', changedFiles: [] },
      ])
    ).toStrictEqual(['package.json']);
  });

  it('dedupes when both commits have the same file as package dependency change', async () => {
    mockFileContents({
      'package.json': {
        A: { dependencies: { a: '1' } },
        B: { dependencies: { a: '1' } },
        HEAD: { dependencies: { a: '2' } },
      },
    });

    expect(
      await findChangedPackageFiles([
        { commit: 'A', changedFiles: ['package.json'] },
        { commit: 'B', changedFiles: ['package.json'] },
      ])
    ).toStrictEqual(['package.json']);
  });

  it('considers the file changed if it fails to parse', async () => {
    mockFileContents({
      'package.json': {
        A: '',
        HEAD: { dependencies: { a: '2' } },
      },
    });

    expect(
      await findChangedPackageFiles([{ commit: 'A', changedFiles: ['package.json'] }])
    ).toStrictEqual(['package.json']);
  });
});

describe('arePackageDependenciesEqual', () => {
  it('returns true if dependencies objects have same number of keys', () => {
    expect(
      arePackageDependenciesEqual(
        { dependencies: { a: '1', b: '2' } },
        { dependencies: { a: '1', b: '2' } }
      )
    ).toBe(true);
  });

  it("returns false if dependencies objects don't have same number of keys", () => {
    expect(
      arePackageDependenciesEqual(
        { dependencies: { a: '1', b: '2' } },
        { dependencies: { a: '1' } }
      )
    ).toBe(false);
  });

  it('returns false if dependencies have same number of keys but keys not the same keys', () => {
    expect(
      arePackageDependenciesEqual(
        { dependencies: { a: '1', b: '2' } },
        { dependencies: { a: '1', c: '3' } }
      )
    ).toBe(false);
  });

  it('returns false if values of dependencies entries are not the same', () => {
    expect(
      arePackageDependenciesEqual(
        { dependencies: { a: '1', b: '2' } },
        { dependencies: { a: '1', b: '1.1' } }
      )
    ).toBe(false);
  });

  it('returns true if dependencies objects have same number of keys, same keys, and same values', () => {
    expect(
      arePackageDependenciesEqual(
        { dependencies: { a: '1', b: '2', c: '3' } },
        { dependencies: { a: '1', b: '2', c: '3' } }
      )
    ).toBe(true);
  });

  it('returns true for dependencies objects with same keys and values, even if properties are in different order', () => {
    expect(
      arePackageDependenciesEqual(
        { dependencies: { a: '1', b: '2', c: '3' } },
        { dependencies: { c: '3', a: '1', b: '2' } }
      )
    ).toBe(true);
  });

  it('returns false if devDependencies are different', () => {
    expect(
      arePackageDependenciesEqual(
        { devDependencies: { a: '1', b: '2' } },
        { devDependencies: { a: '1', b: '2.2' } }
      )
    ).toBe(false);
  });

  it('returns false if peerDependencies are different', () => {
    expect(
      arePackageDependenciesEqual(
        { peerDependencies: { a: '1', b: '2' } },
        { peerDependencies: { a: '1', b: '2.2' } }
      )
    ).toBe(false);
  });

  it('returns false if overrides are different', () => {
    expect(
      arePackageDependenciesEqual(
        { overrides: { a: '1', b: '2' } },
        { overrides: { a: '1', b: '2.2' } }
      )
    ).toBe(false);
  });

  it('returns true if nested overrides are same', () => {
    expect(
      arePackageDependenciesEqual(
        { overrides: { a: '1', b: { c: '1' } } },
        { overrides: { a: '1', b: { c: '1' } } }
      )
    ).toBe(true);
  });

  it('returns false if nested overrides values have different values', () => {
    expect(
      arePackageDependenciesEqual(
        { overrides: { a: '1', b: { c: '1' } } },
        { overrides: { a: '1', b: { c: '2' } } }
      )
    ).toBe(false);
  });

  it('returns false if nested overrides are not same type', () => {
    expect(
      arePackageDependenciesEqual(
        { overrides: { a: '1', b: { c: '1' } } },
        { overrides: { a: '1', b: '2' } }
      )
    ).toBe(false);
  });

  it('returns false if optionalDependencies are different', () => {
    expect(
      arePackageDependenciesEqual(
        { optionalDependencies: { a: '1', b: '1' } },
        { optionalDependencies: { a: '1', b: '2' } }
      )
    ).toBe(false);
  });

  it('returns false if resolutions are different', () => {
    expect(
      arePackageDependenciesEqual(
        { resolutions: { a: '1', b: '1' } },
        { resolutions: { a: '1', b: '2' } }
      )
    ).toBe(false);
  });

  it('returns false if peerDependenciesMeta are different', () => {
    expect(
      arePackageDependenciesEqual(
        { peerDependenciesMeta: { a: { optional: true } } },
        { peerDependenciesMeta: { a: { optional: false } } }
      )
    ).toBe(false);
  });

  it('returns false if dependenciesMeta are different', () => {
    expect(
      arePackageDependenciesEqual(
        { dependenciesMeta: { a: { optional: true } } },
        { dependenciesMeta: { a: { optional: false } } }
      )
    ).toBe(false);
  });

  it('returns false if pnpm-specific fields are different', () => {
    expect(
      arePackageDependenciesEqual(
        { pnpm: { overrides: { foo: '1' } } },
        { pnpm: { overrides: { foo: '2' } } }
      )
    ).toBe(false);
  });

  it("returns true if differing object fields aren't dependency-related", () => {
    expect(
      arePackageDependenciesEqual(
        {
          scripts: {
            test: 'yarn jest --watch',
          },
          dependencies: { a: '1' },
        },
        {
          scripts: {
            test: 'yarn jest --watch',
            build: 'yarn esbuild',
          },
          dependencies: { a: '1' },
        }
      )
    ).toBe(true);
  });

  it("returns true if differing non-object fields aren't dependency-related", () => {
    expect(
      arePackageDependenciesEqual(
        {
          version: '1.0',
          dependencies: { a: '1' },
        },
        {
          name: '1.1',
          dependencies: { a: '1' },
        }
      )
    ).toBe(true);
  });

  it('returns false if multiple dependency fields differ', () => {
    expect(
      arePackageDependenciesEqual(
        {
          dependencies: { a: '1' },
          devDependencies: { c: '3' },
        },
        {
          dependencies: { a: '1', b: '2' },
          devDependencies: { c: '3', d: '4' },
        }
      )
    ).toBe(false);
  });

  it('returns true if all dependency fields are the same', () => {
    expect(
      arePackageDependenciesEqual(
        {
          dependencies: { a: '1', b: '2', c: '3' },
          devDependencies: { d: '4', e: '5', f: '6' },
          peerDependencies: { g: '7', h: '8', i: '9' },
          overrides: { a: '1', b: { c: '1' } },
          optionalDependencies: { a: '1', b: '1' },
          resolutions: { a: '1', b: '2' },
          peerDependenciesMeta: { a: { optional: true } },
          dependenciesMeta: { a: { optional: true } },
          pnpm: {
            overrides: { foo: '1' },
            packageExtensions: {
              c: {
                peerDependencies: {
                  d: '*',
                },
              },
            },
            allowedDeprecatedVersions: {
              g: '1',
            },
          },
        },
        {
          dependencies: { a: '1', b: '2', c: '3' },
          devDependencies: { d: '4', e: '5', f: '6' },
          peerDependencies: { g: '7', h: '8', i: '9' },
          overrides: { a: '1', b: { c: '1' } },
          optionalDependencies: { a: '1', b: '1' },
          resolutions: { a: '1', b: '2' },
          peerDependenciesMeta: { a: { optional: true } },
          dependenciesMeta: { a: { optional: true } },
          pnpm: {
            overrides: { foo: '1' },
            packageExtensions: {
              c: {
                peerDependencies: {
                  d: '*',
                },
              },
            },
            allowedDeprecatedVersions: {
              g: '1',
            },
          },
        }
      )
    ).toBe(true);
  });

  it('returns false if dependency moves from one dependency object to the other', () => {
    expect(
      arePackageDependenciesEqual(
        // same number of keys, but move between
        { dependencies: { a: '1' }, devDependencies: { b: '2' } },
        { dependencies: { b: '2' }, devDependencies: { a: '1' } }
      )
    ).toBe(false);
  });

  it('returns true if non-dependency fields are added or removed', () => {
    expect(
      arePackageDependenciesEqual(
        {
          name: 'foo',
          scripts: { test: 'yarn jest --watch' },
          dependencies: { a: '1' },
        },
        {
          name: 'foo',
          license: 'MIT',
          dependencies: { a: '1' },
        }
      )
    ).toBe(true);
  });

  it('returns false if dependency objects are added', () => {
    expect(arePackageDependenciesEqual({}, { dependencies: { a: '1' } })).toBe(false);
  });

  it('returns false if dependency objects are removed', () => {
    expect(arePackageDependenciesEqual({ dependencies: { a: '1' } }, {})).toBe(false);
  });

  it('returns true if dependencies are null', () => {
    // eslint-disable-next-line unicorn/no-null
    expect(arePackageDependenciesEqual({ dependencies: null }, { dependencies: null })).toBe(true);
  });
});
