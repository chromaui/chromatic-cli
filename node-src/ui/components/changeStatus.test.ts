import { describe, expect, it } from 'vitest';

import {
  autoAcceptedChanges,
  changeStatus,
  formatAcceptedMessage,
  formatChangeCount,
  formatDeniedMessage,
  formatPendingMessage,
} from './changeStatus';

const features = { uiTests: true, uiReview: false, isReactNativeApp: false };
const accessibilityFeatures = { ...features, accessibilityTests: { enabled: true } };

describe('formatChangeCount', () => {
  it.each([
    [1, false, '1 visual change'],
    [2, false, '2 visual changes'],
    [1, true, '1 visual and accessibility change'],
    [2, true, '2 visual and accessibility changes'],
  ])('formats %i changes with accessibility %s', (testCount, hasAccessibility, expected) => {
    expect(formatChangeCount({ testCount, hasAccessibility })).toBe(expected);
  });
});

describe('formatPendingMessage', () => {
  it.each([
    [1, false, '1 visual change must be accepted as baseline'],
    [2, false, '2 visual changes must be accepted as baselines'],
    [2, true, '2 visual and accessibility changes must be accepted as baselines'],
  ])('formats %i changes with accessibility %s', (testCount, hasAccessibility, expected) => {
    expect(formatPendingMessage({ testCount, hasAccessibility })).toBe(expected);
  });
});

describe('formatAcceptedMessage', () => {
  it.each([
    [1, false, '1 visual change accepted as baseline'],
    [3, false, '3 visual changes accepted as baselines'],
    [2, true, '2 visual and accessibility changes accepted as baselines'],
  ])('formats %i changes with accessibility %s', (testCount, hasAccessibility, expected) => {
    expect(formatAcceptedMessage({ testCount, hasAccessibility })).toBe(expected);
  });
});

describe('formatDeniedMessage', () => {
  it.each([
    [1, false, '1 visual change denied'],
    [2, false, '2 visual changes denied'],
    [2, true, '2 visual and accessibility changes denied'],
  ])('formats %i changes with accessibility %s', (testCount, hasAccessibility, expected) => {
    expect(formatDeniedMessage({ testCount, hasAccessibility })).toBe(expected);
  });
});

describe('changeStatus', () => {
  const counts = { pendingCount: 2, acceptedCount: 1, deniedCount: 4 };

  it('reports only pending tests on a pending build', () => {
    expect(changeStatus({ status: 'PENDING', ...counts })).toBe(
      '2 visual changes must be accepted as baselines'
    );
  });

  it('reports accepted tests on an accepted build', () => {
    expect(changeStatus({ status: 'ACCEPTED', ...counts, acceptedCount: 3 })).toBe(
      '3 visual changes accepted as baselines'
    );
  });

  it('reports denied tests on a denied build', () => {
    expect(changeStatus({ status: 'DENIED', ...counts, deniedCount: 1 })).toBe(
      '1 visual change denied'
    );
  });

  it('uses the accessibility wording when accessibility tests are enabled', () => {
    expect(changeStatus({ status: 'DENIED', ...counts, features: accessibilityFeatures })).toBe(
      '4 visual and accessibility changes denied'
    );
  });

  it.each(['PASSED', 'BROKEN'])('reports nothing for a %s build', (status) => {
    expect(changeStatus({ status, ...counts })).toBeUndefined();
  });

  it('reports nothing when the status count is zero', () => {
    expect(changeStatus({ status: 'ACCEPTED', ...counts, acceptedCount: 0 })).toBeUndefined();
  });
});

describe('autoAcceptedChanges', () => {
  it('counts accepted tests', () => {
    expect(autoAcceptedChanges({ pendingCount: 0, acceptedCount: 3, deniedCount: 0 })).toBe(
      'Auto-accepted 3 visual changes'
    );
  });

  it('reports nothing when no tests were accepted', () => {
    expect(autoAcceptedChanges({ acceptedCount: 0 })).toBeUndefined();
  });
});
