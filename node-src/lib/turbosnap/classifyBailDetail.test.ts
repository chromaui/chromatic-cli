import { describe, expect, it } from 'vitest';

import { bailDetailKey, classifyBailDetail, detectLockfileKind } from './classifyBailDetail';
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
      lockfileSizeExceeded: true,
      lockfileKind: 'pnpm-lock.yaml',
      lockfileSizeBytes: 12_000_000,
    });
  });

  it('classifies LockFileSizeExceededError with undefined lockfileKind for an unrecognized path', () => {
    const err = new LockFileSizeExceededError('/tmp/weird-name', 12_000_000);
    expect(classifyBailDetail(err)).toEqual({
      lockfileSizeExceeded: true,
      lockfileKind: undefined,
      lockfileSizeBytes: 12_000_000,
    });
  });

  it('classifies LockFileParseFailedError with kind', () => {
    const err = new LockFileParseFailedError('/tmp/checkout-abc/yarn.lock', {
      cause: new Error('no lock file parse for you'),
    });
    expect(classifyBailDetail(err)).toEqual({
      lockfileParseFailed: true,
      lockfileKind: 'yarn.lock',
    });
  });

  it('classifies BaselineCheckoutFailedError as { baselineCheckoutFailed: true }', () => {
    const err = new BaselineCheckoutFailedError('abc123:package.json', {
      cause: new Error('git show failed'),
    });
    expect(classifyBailDetail(err)).toEqual({ baselineCheckoutFailed: true });
  });
});

describe('bailDetailKey', () => {
  it('returns "unknown" for an empty patch', () => {
    expect(bailDetailKey({})).toBe('unknown');
  });

  it('returns "lockfileSizeExceeded" when the flag is set', () => {
    expect(bailDetailKey({ lockfileSizeExceeded: true })).toBe('lockfileSizeExceeded');
  });

  it('returns "lockfileParseFailed" when the flag is set', () => {
    expect(bailDetailKey({ lockfileParseFailed: true })).toBe('lockfileParseFailed');
  });

  it('returns "baselineCheckoutFailed" when the flag is set', () => {
    expect(bailDetailKey({ baselineCheckoutFailed: true })).toBe('baselineCheckoutFailed');
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
