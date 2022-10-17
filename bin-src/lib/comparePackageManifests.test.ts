import { arePackageDependenciesEqual } from './comparePackageManifests';

it('returns true if dependencies objects have same number of keys', () => {
  expect(
    arePackageDependenciesEqual(
      {
        dependencies: {
          a: '1',
          b: '2',
        },
      },
      {
        dependencies: {
          a: '1',
          b: '2',
        },
      }
    )
  ).toBe(true);
});

it("returns false if dependencies objects don't have same number of keys", () => {
  expect(
    arePackageDependenciesEqual(
      {
        dependencies: {
          a: '1',
          b: '2',
        },
      },
      {
        dependencies: {
          a: '1',
        },
      }
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
      },
      {
        dependencies: { a: '1', b: '2', c: '3' },
        devDependencies: { d: '4', e: '5', f: '6' },
        peerDependencies: { g: '7', h: '8', i: '9' },
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

it('Returns true if dependencies are null', () => {
  expect(arePackageDependenciesEqual({ dependencies: null }, { dependencies: null })).toBe(true);
});
