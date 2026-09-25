import { describe, expect, it } from 'vitest';

import buildHasChanges from './buildHasChanges';

const webUrl = 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=42';
const setupUrl = 'https://www.chromatic.com/setup?appId=59c59bd0183bd100364e1d57';

const message = (
  build: { changeCount?: number; ignoredCount?: number; webUrl?: string },
  isOnboarding = false
) =>
  buildHasChanges({
    build: {
      number: 42,
      changeCount: 0,
      accessibilityChangeCount: 0,
      ignoredCount: 0,
      webUrl,
      app: { setupUrl },
      ...build,
    },
    exitCode: 1,
    isOnboarding,
  });

describe('buildHasChanges ignored tests link', () => {
  it('expands ignored tests on a build URL that already has a query string', () => {
    expect(message({ ignoredCount: 1 })).toContain(`Review at ${webUrl}&expandIgnored=true`);
  });

  it('starts a query string on a build URL that has none', () => {
    const output = message({ ignoredCount: 1, webUrl: 'https://www.chromatic.com/build' });

    expect(output).toContain('Review at https://www.chromatic.com/build?expandIgnored=true');
  });

  it('leaves the setup URL untouched while onboarding', () => {
    const output = message({ changeCount: 2, ignoredCount: 1 }, true);

    expect(output).toContain(`1 test was ignored in this build. Review at ${setupUrl}\n`);
    expect(output).not.toContain('expandIgnored');
    expect(output).not.toContain('#unstable');
  });

  it('still reports ignored tests while onboarding', () => {
    expect(message({ ignoredCount: 3 }, true)).toContain('3 tests were ignored in this build.');
  });

  it('falls back to the given URL rather than throwing on a malformed one', () => {
    const output = message({ ignoredCount: 1, webUrl: 'not-a-url' });

    expect(output).toContain('Review at not-a-url');
  });

  it('omits the ignored line when nothing was ignored', () => {
    expect(message({ changeCount: 2 })).not.toContain('ignored in this build');
    expect(message({ changeCount: 2 })).not.toContain('expandIgnored');
  });
});
