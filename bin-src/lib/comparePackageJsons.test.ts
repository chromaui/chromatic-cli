import comparePackageJsons from './comparePackageJsons';

it('returns true if objects have same number of keys', () => {
  expect(
    comparePackageJsons(
      {
        dependencies: {
          a: 1,
          b: 2,
        },
      },
      {
        dependencies: {
          a: 1,
          b: 2,
        },
      }
    )
  ).toBe(true);
});

it("returns false if objects don't have same number of keys", () => {
  expect(
    comparePackageJsons(
      {
        dependencies: {
          a: 1,
          b: 2,
        },
      },
      {
        dependencies: {
          a: 1,
        },
      }
    )
  ).toBe(false);
});

it('returns false if same number of keys but keys not the same', () => {
  expect(
    comparePackageJsons({ dependencies: { a: 1, b: 2 } }, { dependencies: { a: 1, c: 3 } })
  ).toBe(false);
});

it('returns false if values of entries are not the same', () => {
  expect(
    comparePackageJsons({ dependencies: { a: 1, b: 2 } }, { dependencies: { a: 1, b: 1.1 } })
  ).toBe(false);
});

it('returns true if objects have same number of keys, same keys, and same values', () => {
  expect(
    comparePackageJsons(
      { dependencies: { a: 1, b: 2, c: 3 } },
      { dependencies: { a: 1, b: 2, c: 3 } }
    )
  ).toBe(true);
});

it('returns true for objects with same keys and values, even if properties are in different order', () => {
  expect(
    comparePackageJsons(
      { dependencies: { a: 1, b: 2, c: 3 } },
      { dependencies: { c: 3, a: 1, b: 2 } }
    )
  ).toBe(true);
});
