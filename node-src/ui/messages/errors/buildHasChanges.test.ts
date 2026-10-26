import { describe, expect, it } from 'vitest';

import buildHasChanges from './buildHasChanges';

const webUrl = 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=42';
const setupUrl = 'https://www.chromatic.com/setup?appId=59c59bd0183bd100364e1d57';
const features = { uiTests: true, uiReview: false, isReactNativeApp: false };

const message = (
  build: {
    status?: string;
    pendingCount?: number;
    acceptedCount?: number;
    deniedCount?: number;
    changeCount?: number;
    ignoredCount?: number;
    webUrl?: string;
    features?: typeof features & { accessibilityTests?: { enabled: boolean } };
  },
  isOnboarding = false
) =>
  buildHasChanges({
    build: {
      number: 42,
      status: 'PENDING',
      pendingCount: 0,
      acceptedCount: 0,
      deniedCount: 0,
      ignoredCount: 0,
      webUrl,
      app: { setupUrl },
      features,
      ...build,
    },
    exitCode: 1,
    isOnboarding,
  });

describe('buildHasChanges ignored tests line', () => {
  it('links ignored tests to the expanded build page', () => {
    expect(message({ ignoredCount: 1 })).toContain(
      `1 test was ignored in this build. Review at ${webUrl}&expandIgnored=true\n`
    );
  });

  it('points ignored tests at the untouched setup page while onboarding', () => {
    const output = message({ pendingCount: 2, ignoredCount: 1 }, true);

    expect(output).toContain(`1 test was ignored in this build. Review at ${setupUrl}\n`);
    expect(output).not.toContain('expandIgnored');
  });
});

describe('buildHasChanges changes line', () => {
  it.each([
    [1, '1 visual change must be accepted as baseline'],
    [2, '2 visual changes must be accepted as baselines'],
  ])('reports %i pending changes', (pendingCount, expected) => {
    expect(message({ pendingCount })).toContain(`${expected}. Review at ${webUrl}`);
  });

  it('uses the accessibility wording when accessibility tests are enabled', () => {
    const output = message({
      pendingCount: 2,
      features: { ...features, accessibilityTests: { enabled: true } },
    });

    expect(output).toContain(
      `2 visual and accessibility changes must be accepted as baselines. Review at ${webUrl}`
    );
  });

  it('does not count ignored tests as changes', () => {
    expect(message({ pendingCount: 1, ignoredCount: 2 })).toMatch(
      /1 visual change must be accepted as baseline\. Review at \S+\n\n2 tests were ignored/
    );
  });

  it('points changes at the setup page while onboarding', () => {
    expect(message({ pendingCount: 2 }, true)).toContain(
      `2 visual changes must be accepted as baselines. Review at ${setupUrl}`
    );
  });

  it('ignores changeCount, which includes ignored tests', () => {
    const output = message({ changeCount: 99, pendingCount: 1 });

    expect(output).toContain('1 visual change must be accepted as baseline');
    expect(output).not.toContain('99');
  });

  it('does not count accepted or denied tests on a pending build', () => {
    const output = message({ pendingCount: 1, acceptedCount: 5, deniedCount: 3 });

    expect(output).toContain(`1 visual change must be accepted as baseline. Review at ${webUrl}`);
  });

  it('reports denied tests on a denied build', () => {
    const output = message({ status: 'DENIED', pendingCount: 2, deniedCount: 1 });

    expect(output).toContain(`1 visual change denied. Review at ${webUrl}`);
    expect(output).not.toContain('must be accepted');
  });

  it('reports accepted tests on an accepted build', () => {
    const output = message({ status: 'ACCEPTED', acceptedCount: 3 });

    expect(output).toContain(`3 visual changes accepted as baselines. Review at ${webUrl}`);
    expect(output).not.toContain('must be accepted');
  });

  it('always includes the CI/CD exit code guidance', () => {
    expect(message({ pendingCount: 2 })).toContain(
      'For CI/CD use cases, this command failed with exit code 1'
    );
  });
});
