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

it('returns false if dependencies have same number of keys but keys not the same', () => {
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
