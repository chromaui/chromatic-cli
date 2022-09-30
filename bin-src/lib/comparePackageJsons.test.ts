import comparePackageJsons from './comparePackageJsons';

it('returns true if objects have same number of keys', () => {
  expect(
    comparePackageJsons(
      {
        a: 1,
        b: 2,
      },
      {
        a: 1,
        b: 2,
      }
    )
  ).toBe(true);
});

it("returns false if objects don't have same number of keys", () => {
  expect(
    comparePackageJsons(
      {
        a: 1,
        b: 2,
      },
      {
        a: 1,
      }
    )
  ).toBe(false);
});

it('returns false if same number of keys but keys not the same', () => {
  expect(comparePackageJsons({ a: 1, b: 2 }, { a: 1, c: 3 })).toBe(false);
});

it('returns false if values of entries are not the same', () => {
  expect(comparePackageJsons({ a: 1, b: 2 }, { a: 1, b: 1.1 })).toBe(false);
});
