import { describe, expect, it } from 'vitest';

import { shouldTraceWithV1 } from './shouldTraceWithV1';

const ctx = (turboSnap: object, git: object) => ({ turboSnap, git }) as any;

describe('shouldTraceWithV1', () => {
  it('does not trace without a computed changed-file list', () => {
    expect(shouldTraceWithV1(ctx({}, {}))).toBe(false);
  });

  it('traces with an empty changed-file list', () => {
    expect(shouldTraceWithV1(ctx({}, { changedFiles: [] }))).toBe(true);
  });
});
