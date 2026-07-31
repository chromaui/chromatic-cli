import { describe, expect, it } from 'vitest';

import { classifyUploadHashesFailure } from './classifyUploadHashesFailure';

describe('classifyUploadHashesFailure', () => {
  it('names nothing when the response carries the success member', () => {
    expect(
      classifyUploadHashesFailure({
        build: { turboSnapStatus: 'APPLIED', turboSnapMechanism: 'HASH_BASED' },
      })
    ).toBeUndefined();
  });

  it('names invalid story file hashes as our own malformed request', () => {
    const failure = classifyUploadHashesFailure({
      errors: [
        { __typename: 'InvalidStoryFileHashesError', message: 'Invalid story file hashes.' },
      ],
    });

    expect(failure?.bailSubreason).toBe('invalidStoryFileHashes');
    expect(failure?.error.message).toContain('Invalid story file hashes.');
  });

  it('names an invalid build status as calling at the wrong point in the lifecycle', () => {
    const failure = classifyUploadHashesFailure({
      errors: [
        {
          __typename: 'InvalidUploadHashesBuildStatusError',
          message: 'Uploading hashes is only allowed for announced builds.',
        },
      ],
    });

    expect(failure?.bailSubreason).toBe('invalidBuildStatus');
  });

  it('accepts the error typenames without the Error suffix', () => {
    expect(
      classifyUploadHashesFailure({ errors: [{ __typename: 'InvalidStoryFileHashes' }] })
        ?.bailSubreason
    ).toBe('invalidStoryFileHashes');
    expect(
      classifyUploadHashesFailure({ errors: [{ __typename: 'InvalidUploadHashesBuildStatus' }] })
        ?.bailSubreason
    ).toBe('invalidBuildStatus');
  });

  it('names a response matching neither union member, which is otherwise indistinguishable from success', () => {
    const failure = classifyUploadHashesFailure({});

    expect(failure?.bailSubreason).toBe('invalidResponse');
    expect(failure?.error.message).toContain('neither member');
  });

  it('names a missing payload as schema drift too', () => {
    expect(classifyUploadHashesFailure(undefined)?.bailSubreason).toBe('invalidResponse');
  });

  it('treats an empty errors array as matching neither member', () => {
    expect(classifyUploadHashesFailure({ errors: [] })?.bailSubreason).toBe('invalidResponse');
  });

  it('groups an unrecognized error typename under schema drift', () => {
    const failure = classifyUploadHashesFailure({
      errors: [{ __typename: 'SomeNewError', message: 'Something else went wrong.' }],
    });

    expect(failure?.bailSubreason).toBe('invalidResponse');
    expect(failure?.error.message).toContain('SomeNewError: Something else went wrong.');
  });

  it('reports every error message when the Index returns several', () => {
    const failure = classifyUploadHashesFailure({
      errors: [
        { __typename: 'SomeNewError' },
        { __typename: 'InvalidStoryFileHashesError', message: 'Invalid story file hashes.' },
      ],
    });

    expect(failure?.bailSubreason).toBe('invalidStoryFileHashes');
    expect(failure?.error.message).toContain('SomeNewError');
    expect(failure?.error.message).toContain('Invalid story file hashes.');
  });
});
