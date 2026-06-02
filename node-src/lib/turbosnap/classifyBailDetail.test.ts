import { describe, expect, it } from 'vitest';

import { classifyBailDetail, detectLockfileKind } from './classifyBailDetail';
import {
  BaselineCheckoutFailedError,
  LockFileParseFailedError,
  LockFileSizeExceededError,
} from './errors';

describe('classifyBailDetail', () => {
  it('returns {} for a generic Error', () => {
    expect(classifyBailDetail(new Error('whatever'))).toEqual({});
  });

  it('returns {} for a non-Error value', () => {
    expect(classifyBailDetail('string')).toEqual({});
    expect(classifyBailDetail(undefined)).toEqual({});
  });

  it('classifies LockFileSizeExceededError with kind + size', () => {
    const err = new LockFileSizeExceededError('/tmp/checkout-abc/pnpm-lock.yaml', 12_000_000);
    expect(classifyBailDetail(err)).toEqual({
      bailSubreason: 'lockfileSizeExceeded',
      lockfileKind: 'pnpm-lock.yaml',
      lockfileSizeBytes: 12_000_000,
    });
  });

  it('classifies LockFileSizeExceededError without lockfileKind for an unrecognized path', () => {
    const err = new LockFileSizeExceededError('/tmp/weird-name', 12_000_000);
    const patch = classifyBailDetail(err);
    expect(patch).toEqual({
      bailSubreason: 'lockfileSizeExceeded',
      lockfileSizeBytes: 12_000_000,
    });
    expect(patch).not.toHaveProperty('lockfileKind');
  });

  it('classifies LockFileParseFailedError with kind', () => {
    const err = new LockFileParseFailedError('/tmp/checkout-abc/yarn.lock', {
      cause: new Error('no lock file parse for you'),
    });
    expect(classifyBailDetail(err)).toEqual({
      bailSubreason: 'lockfileParseFailed',
      lockfileKind: 'yarn.lock',
    });
  });

  it('classifies BaselineCheckoutFailedError as { bailSubreason: "baselineCheckoutFailed" }', () => {
    const err = new BaselineCheckoutFailedError('abc123:package.json', {
      cause: new Error('git show failed'),
    });
    expect(classifyBailDetail(err)).toEqual({ bailSubreason: 'baselineCheckoutFailed' });
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

  it('does not match a path whose basename only happens to end with a lockfile name', () => {
    expect(detectLockfileKind('/tmp/checkout-abc/my.yarn.lock')).toBeUndefined();
    expect(detectLockfileKind('/tmp/checkout-abc/old-package-lock.json')).toBeUndefined();
  });
});
