import { describe, expect, it } from 'vitest';

import {
  classifyInvalidChangedFilesDetail,
  invalidChangedFilesDetailKey,
} from './classifyInvalidChangedFilesDetail';
import {
  AncestorMissingError,
  BaselineDirtyError,
  GitCommandError,
  NetworkError,
  ReplacementFailedError,
} from './errors';

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
      ancestorMissing: true,
    });
  });

  it('classifies BaselineDirtyError', () => {
    expect(classifyInvalidChangedFilesDetail(new BaselineDirtyError('abc123'))).toEqual({
      baselineDirty: true,
    });
  });

  it('classifies NetworkError', () => {
    expect(classifyInvalidChangedFilesDetail(new NetworkError())).toEqual({ networkError: true });
  });

  it('classifies ReplacementFailedError', () => {
    expect(classifyInvalidChangedFilesDetail(new ReplacementFailedError())).toEqual({
      replacementFailed: true,
    });
  });

  it('classifies GitCommandError', () => {
    expect(classifyInvalidChangedFilesDetail(new GitCommandError('git diff'))).toEqual({
      gitCommandFailed: true,
    });
  });
});

describe('invalidChangedFilesDetailKey', () => {
  it('returns undefined for an empty patch', () => {
    expect(invalidChangedFilesDetailKey({})).toBeUndefined();
  });

  it('returns "ancestorMissing" when the flag is set', () => {
    expect(invalidChangedFilesDetailKey({ ancestorMissing: true })).toBe('ancestorMissing');
  });

  it('returns "baselineDirty" when the flag is set', () => {
    expect(invalidChangedFilesDetailKey({ baselineDirty: true })).toBe('baselineDirty');
  });

  it('returns "networkError" when the flag is set', () => {
    expect(invalidChangedFilesDetailKey({ networkError: true })).toBe('networkError');
  });

  it('returns "replacementFailed" when the flag is set', () => {
    expect(invalidChangedFilesDetailKey({ replacementFailed: true })).toBe('replacementFailed');
  });

  it('returns "gitCommandFailed" when the flag is set', () => {
    expect(invalidChangedFilesDetailKey({ gitCommandFailed: true })).toBe('gitCommandFailed');
  });
});
