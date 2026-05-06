import { describe, expect, it } from 'vitest';

import initialize from './index';

describe('initialize', () => {
  it('can call without error', () => {
    // Temporary. Will test task orchestration once it's refactored.
    const result = initialize({} as any);
    expect(result).toBeDefined();
  });
});
