import comparePackageJsons from './comparePackageJsons';

it('returns true if dependencies objects have same number of keys', () => {
  expect(
    comparePackageJsons(
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
    comparePackageJsons(
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
    comparePackageJsons({ dependencies: { a: '1', b: '2' } }, { dependencies: { a: '1', c: '3' } })
  ).toBe(false);
});

it('returns false if values of dependencies entries are not the same', () => {
  expect(
    comparePackageJsons(
      { dependencies: { a: '1', b: '2' } },
      { dependencies: { a: '1', b: '1.1' } }
    )
  ).toBe(false);
});

it('returns true if dependencies objects have same number of keys, same keys, and same values', () => {
  expect(
    comparePackageJsons(
      { dependencies: { a: '1', b: '2', c: '3' } },
      { dependencies: { a: '1', b: '2', c: '3' } }
    )
  ).toBe(true);
});

it('returns true for dependencies objects with same keys and values, even if properties are in different order', () => {
  expect(
    comparePackageJsons(
      { dependencies: { a: '1', b: '2', c: '3' } },
      { dependencies: { c: '3', a: '1', b: '2' } }
    )
  ).toBe(true);
});

it('returns false if devDependencies are different', () => {
  expect(
    comparePackageJsons(
      { devDependencies: { a: '1', b: '2' } },
      { devDependencies: { a: '1', b: '2.2' } }
    )
  ).toBe(false);
});

it('returns false if peerDependencies are different', () => {
  expect(
    comparePackageJsons(
      { peerDependencies: { a: '1', b: '2' } },
      { peerDependencies: { a: '1', b: '2.2' } }
    )
  ).toBe(false);
});

it("returns true if differing object fields aren't dependency-related", () => {
  expect(
    comparePackageJsons(
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
    comparePackageJsons(
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
    comparePackageJsons(
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
    comparePackageJsons(
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

it('returns true if non-dependency fields are added or removed', () => {
  expect(
    comparePackageJsons(
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
  expect(comparePackageJsons({}, { dependencies: { a: '1' } })).toBe(false);
});

it('returns false if dependency objects are removed', () => {
  expect(comparePackageJsons({ dependencies: { a: '1' } }, {})).toBe(false);
});
