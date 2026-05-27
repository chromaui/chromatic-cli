import { describe, expect, it } from 'vitest';

import { HTTPClientError } from '../../io/httpClient';
import { isNetworkError } from './errors';

describe('isNetworkError', () => {
  it('returns true for HTTPClientError', () => {
    const err = new HTTPClientError({ url: 'https://x', status: 500, statusText: 'x' } as any);
    expect(isNetworkError(err)).toBe(true);
  });

  it('returns true when err.name is "FetchError"', () => {
    const err = new Error('boom');
    (err as any).name = 'FetchError';
    expect(isNetworkError(err)).toBe(true);
  });

  it('returns true for a known network error code on err.code', () => {
    const err = Object.assign(new Error('boom'), { code: 'ENOTFOUND' });
    expect(isNetworkError(err)).toBe(true);
  });

  it('returns true for a known network error code on err.cause.code', () => {
    const err = Object.assign(new Error('boom'), { cause: { code: 'ECONNREFUSED' } });
    expect(isNetworkError(err)).toBe(true);
  });

  it('returns false for a generic Error', () => {
    expect(isNetworkError(new Error('whatever'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isNetworkError('string')).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
});
