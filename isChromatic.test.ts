/* eslint-env browser */
import { describe, expect, it } from 'vitest';

import isChromatic from './isChromatic';

describe('with window arg', () => {
  it('returns false', () => {
    expect(
      isChromatic({
        navigator: {
          userAgent: 'Chrome',
        },
        location: new URL('https://example.com'),
      } as any as typeof globalThis)
    ).toBe(false);
  });

  it('returns true if location.href contains chromatic=true queryparam', () => {
    expect(
      isChromatic({
        navigator: {
          userAgent: 'Chrome',
        },
        location: new URL('https://example.com?chromatic=true'),
      } as any as typeof globalThis)
    ).toBe(true);
  });

  it('returns true if userAgent contains Chromatic', () => {
    expect(
      isChromatic({
        navigator: {
          userAgent: 'Chromium(Chromatic)',
        },
        location: new URL('https://example.com'),
      } as any as typeof globalThis)
    ).toBe(true);
  });
});
