import { describe, expect, it } from 'vitest';

import { isHashCollectionDisabled } from './isHashCollectionDisabled';

const ctx = (environment: object, options: object) => ({ env: environment, options }) as any;

describe('isHashCollectionDisabled', () => {
  it('collects hashes by default', () => {
    expect(isHashCollectionDisabled(ctx({}, {}))).toBe(false);
  });

  it('collects hashes when onlyChanged is enabled', () => {
    expect(isHashCollectionDisabled(ctx({}, { onlyChanged: true }))).toBe(false);
    expect(isHashCollectionDisabled(ctx({}, { onlyChanged: 'main' }))).toBe(false);
  });

  it('disables hash collection when onlyChanged is explicitly false', () => {
    expect(isHashCollectionDisabled(ctx({}, { onlyChanged: false }))).toBe(true);
  });

  it('disables hash collection when the env off switch is set', () => {
    expect(isHashCollectionDisabled(ctx({ CHROMATIC_TURBOSNAP_DISABLE_HASHES: true }, {}))).toBe(
      true
    );
  });
});
