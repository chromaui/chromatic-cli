import { describe, expect, it } from 'vitest';

import ignoredTests from './ignoredTests';

const webUrl = 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=42';
const setupUrl = 'https://www.chromatic.com/setup?appId=59c59bd0183bd100364e1d57';

describe('ignoredTests', () => {
  it('returns nothing when no tests were ignored', () => {
    expect(ignoredTests({ ignoredCount: 0, url: webUrl, isOnboarding: false })).toBeUndefined();
    expect(ignoredTests({ url: webUrl, isOnboarding: false })).toBeUndefined();
  });

  it.each([
    [1, '1 test was ignored in this build.'],
    [3, '3 tests were ignored in this build.'],
  ])('reports %i ignored tests', (ignoredCount, expected) => {
    expect(ignoredTests({ ignoredCount, url: webUrl, isOnboarding: false })).toContain(expected);
  });

  it('expands ignored tests on a build URL that already has a query string', () => {
    expect(ignoredTests({ ignoredCount: 1, url: webUrl, isOnboarding: false })).toBe(
      `1 test was ignored in this build. Review at ${webUrl}&expandIgnored=true`
    );
  });

  it('starts a query string on a build URL that has none', () => {
    const url = 'https://www.chromatic.com/build';

    expect(ignoredTests({ ignoredCount: 1, url, isOnboarding: false })).toBe(
      `1 test was ignored in this build. Review at ${url}?expandIgnored=true`
    );
  });

  it('leaves the setup URL untouched while onboarding', () => {
    expect(ignoredTests({ ignoredCount: 1, url: setupUrl, isOnboarding: true })).toBe(
      `1 test was ignored in this build. Review at ${setupUrl}`
    );
  });

  it('falls back to the given URL rather than throwing on a malformed one', () => {
    expect(ignoredTests({ ignoredCount: 1, url: 'not-a-url', isOnboarding: false })).toBe(
      '1 test was ignored in this build. Review at not-a-url'
    );
  });
});
