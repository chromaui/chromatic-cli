import { describe, expect, it } from 'vitest';

import { Context } from '../../../types';
import { info, success } from '../../components/icons';
import buildPassed from './buildPassed';

const webUrl = 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=42';
const setupUrl = 'https://www.chromatic.com/setup?appId=59c59bd0183bd100364e1d57';
const features = { uiTests: true, uiReview: false, isReactNativeApp: false };

const baseBuild = {
  number: 42,
  status: 'PASSED',
  pendingCount: 0,
  acceptedCount: 0,
  deniedCount: 0,
  ignoredCount: 0,
  autoAcceptChanges: false,
  changeCount: 0,
  webUrl,
  features,
  app: { setupUrl },
};

const message = (build: Partial<Context['build']>, ctx: Partial<Context> = {}) =>
  buildPassed({ options: {}, ...ctx, build: { ...baseBuild, ...build } } as Context);

describe('buildPassed changes line', () => {
  it('reports no changes on a clean build', () => {
    const output = message({});

    expect(output.split('\n')).toEqual([
      `${success} Build 42 passed!`,
      'No changes were found in this build.',
      `${info} View build details at ${webUrl}`,
    ]);
  });

  it.each([
    [1, '1 visual change must be accepted as baseline.'],
    [2, '2 visual changes must be accepted as baselines.'],
  ])('reports %i pending changes that passed via --exit-zero-on-changes', (count, expected) => {
    expect(message({ status: 'PENDING', pendingCount: count, acceptedCount: 4 })).toContain(
      expected
    );
  });

  it('uses the accessibility wording when accessibility tests are enabled', () => {
    const output = message({
      status: 'PENDING',
      pendingCount: 2,
      features: { ...features, accessibilityTests: { enabled: true } },
    });

    expect(output).toContain('2 visual and accessibility changes must be accepted as baselines.');
  });

  it('reports auto-accepted changes', () => {
    const output = message({
      status: 'ACCEPTED',
      autoAcceptChanges: true,
      acceptedCount: 3,
    });

    expect(output).toContain('Auto-accepted 3 visual changes.');
    expect(output).not.toContain('must be accepted');
  });

  it('uses the accessibility wording for auto-accepted changes when accessibility tests are enabled', () => {
    const output = message({
      status: 'ACCEPTED',
      autoAcceptChanges: true,
      acceptedCount: 2,
      features: { ...features, accessibilityTests: { enabled: true } },
    });

    expect(output).toContain('Auto-accepted 2 visual and accessibility changes.');
  });

  it('reports accepted changes that passed via --exit-zero-on-changes', () => {
    const output = message({ status: 'ACCEPTED', acceptedCount: 3 });

    expect(output).toContain('3 visual changes accepted as baselines.');
    expect(output).not.toContain('must be accepted');
  });

  it('reports denied changes that passed via --exit-zero-on-changes', () => {
    const output = message({
      status: 'DENIED',
      deniedCount: 1,
      features: { ...features, accessibilityTests: { enabled: true } },
    });

    expect(output).toContain('1 visual and accessibility change denied.');
    expect(output).not.toContain('must be accepted');
  });

  it('ignores changeCount, which includes ignored tests', () => {
    const output = message({ status: 'PENDING', changeCount: 9, pendingCount: 2 });

    expect(output).toContain('2 visual changes must be accepted as baselines.');
    expect(output).not.toContain('9 visual changes');
  });
});

describe('buildPassed ignored tests line', () => {
  it('reports ignored tests between the changes line and the build link', () => {
    expect(message({ ignoredCount: 3 }).split('\n')).toEqual([
      `${success} Build 42 passed!`,
      'No changes were found in this build.',
      `3 tests were ignored in this build. Review at ${webUrl}&expandIgnored=true`,
      `${info} View build details at ${webUrl}`,
    ]);
  });

  it('reports ignored tests on an auto-accepted build', () => {
    const output = message({
      status: 'ACCEPTED',
      autoAcceptChanges: true,
      acceptedCount: 1,
      ignoredCount: 1,
    });

    expect(output).toMatch(/Auto-accepted 1 visual change\.\n1 test was ignored in this build\./);
  });
});

describe('buildPassed while onboarding', () => {
  const onboarding = { componentCount: 5, specCount: 8, actualCaptureCount: 20 };

  it('welcomes the user and points at the setup page', () => {
    const output = message(onboarding, { isOnboarding: true });

    expect(output.split('\n')).toEqual([
      `${success} Build passed. Welcome to Chromatic!`,
      'We found 5 components with 8 stories and captured 20 snapshots.',
      `${info} Please continue setup at ${setupUrl}`,
    ]);
  });

  it('reports ignored tests against the untouched setup page', () => {
    const output = message({ ...onboarding, ignoredCount: 1 }, { isOnboarding: true });

    expect(output.split('\n')).toEqual([
      `${success} Build passed. Welcome to Chromatic!`,
      'We found 5 components with 8 stories and captured 20 snapshots.',
      `1 test was ignored in this build. Review at ${setupUrl}`,
      `${info} Please continue setup at ${setupUrl}`,
    ]);
  });
});
