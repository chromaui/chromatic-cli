import { describe, expect, it } from 'vitest';

import {
  classifyChangedPackageFilesDetail,
  classifyInvalidChangedFilesDetail,
} from './classifyBailDetail';
import {
  AncestorMissingError,
  BaselineCheckoutFailedError,
  BaselineDirtyError,
  GitCommandError,
  LockFileParseFailedError,
  LockFileSizeExceededError,
  NetworkError,
  ReplacementFailedError,
} from './errors';

describe('classifyChangedPackageFilesDetail', () => {
  it('returns {} for a generic Error', () => {
    expect(classifyChangedPackageFilesDetail(new Error('whatever'))).toEqual({});
  });

  it('returns {} for a non-Error value', () => {
    expect(classifyChangedPackageFilesDetail('string')).toEqual({});
    expect(classifyChangedPackageFilesDetail(undefined)).toEqual({});
  });

  it('classifies LockFileSizeExceededError with kind + size', () => {
    const err = new LockFileSizeExceededError('/tmp/checkout-abc/pnpm-lock.yaml', 12_000_000);
    expect(classifyChangedPackageFilesDetail(err)).toEqual({
      bailSubreason: 'lockfileSizeExceeded',
      lockfileKind: 'pnpm-lock.yaml',
      lockfileSizeBytes: 12_000_000,
    });
  });

  it('classifies LockFileSizeExceededError without lockfileKind for an unrecognized path', () => {
    const err = new LockFileSizeExceededError('/tmp/weird-name', 12_000_000);
    const patch = classifyChangedPackageFilesDetail(err);
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
    expect(classifyChangedPackageFilesDetail(err)).toEqual({
      bailSubreason: 'lockfileParseFailed',
      lockfileKind: 'yarn.lock',
    });
  });

  it('classifies BaselineCheckoutFailedError as { bailSubreason: "baselineCheckoutFailed" }', () => {
    const err = new BaselineCheckoutFailedError('abc123:package.json', {
      cause: new Error('git show failed'),
    });
    expect(classifyChangedPackageFilesDetail(err)).toEqual({
      bailSubreason: 'baselineCheckoutFailed',
    });
  });
});

const lockfileKindOf = (lockfilePath: string) =>
  classifyChangedPackageFilesDetail(new LockFileSizeExceededError(lockfilePath, 1)).lockfileKind;

describe('lockfileKind', () => {
  it.each([
    { lockfilePath: '/tmp/checkout-abc/yarn.lock', expected: 'yarn.lock' },
    { lockfilePath: '/tmp/checkout-abc/pnpm-lock.yaml', expected: 'pnpm-lock.yaml' },
    { lockfilePath: '/tmp/checkout-abc/package-lock.json', expected: 'package-lock.json' },
    { lockfilePath: '/tmp/checkout-abc/package.json', expected: undefined },
    { lockfilePath: '', expected: undefined },
    // The basename only ends with a lockfile name.
    { lockfilePath: '/tmp/checkout-abc/my.yarn.lock', expected: undefined },
    { lockfilePath: '/tmp/checkout-abc/old-package-lock.json', expected: undefined },
  ])('is $expected for $lockfilePath', ({ lockfilePath, expected }) => {
    expect(lockfileKindOf(lockfilePath)).toBe(expected);
  });
});

describe('classifyInvalidChangedFilesDetail', () => {
  it('returns {} for a generic Error', () => {
    expect(classifyInvalidChangedFilesDetail(new Error('whatever'))).toEqual({});
  });

  it('returns {} for non-Error values', () => {
    expect(classifyInvalidChangedFilesDetail('string')).toEqual({});
    expect(classifyInvalidChangedFilesDetail(undefined)).toEqual({});
  });

  it('classifies AncestorMissingError', () => {
    expect(classifyInvalidChangedFilesDetail(new AncestorMissingError('abc123'))).toEqual({
      bailSubreason: 'ancestorMissing',
    });
  });

  it('classifies BaselineDirtyError', () => {
    expect(classifyInvalidChangedFilesDetail(new BaselineDirtyError('abc123'))).toEqual({
      bailSubreason: 'baselineDirty',
    });
  });

  it('classifies NetworkError', () => {
    expect(classifyInvalidChangedFilesDetail(new NetworkError())).toEqual({
      bailSubreason: 'networkError',
    });
  });

  it('classifies ReplacementFailedError', () => {
    expect(classifyInvalidChangedFilesDetail(new ReplacementFailedError())).toEqual({
      bailSubreason: 'replacementFailed',
    });
  });

  it('classifies GitCommandError', () => {
    expect(classifyInvalidChangedFilesDetail(new GitCommandError('git diff'))).toEqual({
      bailSubreason: 'gitCommandFailed',
    });
  });
});
