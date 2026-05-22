import { describe, expect, it } from 'vitest';

import { bailDetailKey, classifyBailDetail, detectLockfileKind } from './classifyBailDetail';

describe('classifyBailDetail', () => {
  it('returns {} for a generic Error', () => {
    expect(classifyBailDetail(new Error('whatever'))).toEqual({});
  });

  it('returns {} for a non-Error value', () => {
    expect(classifyBailDetail('string')).toEqual({});
    expect(classifyBailDetail(undefined)).toEqual({});
  });
});

describe('bailDetailKey', () => {
  it('returns "unknown" for an empty patch', () => {
    expect(bailDetailKey({})).toBe('unknown');
  });
});

describe('detectLockfileKind', () => {
  it('returns "yarn.lock" for a yarn lockfile path', () => {
    expect(detectLockfileKind('/tmp/checkout-abc/yarn.lock')).toBe('yarn.lock');
  });

  it('returns "pnpm-lock.yaml" for a pnpm lockfile path', () => {
    expect(detectLockfileKind('/tmp/checkout-abc/pnpm-lock.yaml')).toBe('pnpm-lock.yaml');
  });

  it('returns "package-lock.json" for an npm lockfile path', () => {
    expect(detectLockfileKind('/tmp/checkout-abc/package-lock.json')).toBe('package-lock.json');
  });

  it('returns undefined for an unrecognized path', () => {
    expect(detectLockfileKind('/tmp/checkout-abc/package.json')).toBeUndefined();
    expect(detectLockfileKind('')).toBeUndefined();
  });
});
