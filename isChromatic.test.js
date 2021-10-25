/* eslint-env browser */

const isChromatic = require('./isChromatic');

describe('with window arg', () => {
  it('returns false', () => {
    expect(
      isChromatic({
        navigator: {
          userAgent: 'Chrome',
        },
        location: new URL('https://example.com'),
      })
    ).toBe(false);
  });

  it('returns true if location.href contains chromatic=true queryparam', () => {
    expect(
      isChromatic({
        navigator: {
          userAgent: 'Chrome',
        },
        location: new URL('https://example.com?chromatic=true'),
      })
    ).toBe(true);
  });

  it('returns true if userAgent contains Chromatic', () => {
    expect(
      isChromatic({
        navigator: {
          userAgent: 'Chromium(Chromatic)',
        },
        location: new URL('https://example.com'),
      })
    ).toBe(true);
  });
});
