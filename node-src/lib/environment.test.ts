import { describe, expect, it } from 'vitest';

import { redactEnvironment } from './environment';

describe('redactEnvironment', () => {
  it('redacts environment variable values', () => {
    expect(
      redactEnvironment({
        EMPTY: '',
        UNDEF: undefined,
        SMALL: '0123',
        LONG: '0123456789ABCDEF',
      })
    ).toEqual({
      EMPTY: '...',
      UNDEF: '...',
      SMALL: '0...',
      LONG: '01...EF',
    });
  });
});
