import { describe, expect, it } from 'vitest';

import { classifyInvalidChangedFilesDetail } from './classifyInvalidChangedFilesDetail';
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
