import { describe, it, expect } from 'vitest';
import { getDiagnostics } from './writeChromaticDiagnostics';

describe('getDiagnostics', () => {
  it('returns context object', () => {
    const ctx = { build: { number: 1 } };
    expect(getDiagnostics(ctx as any)).toEqual(ctx);
  });

  it('omits certain fields', () => {
    const ctx = { argv: [], client: {}, env: {}, log: {}, pkg: {}, title: {} };
    expect(getDiagnostics(ctx as any)).toEqual({});
  });

  it('redacts sensitive fields', () => {
    const ctx = {
      build: { number: 1, reportToken: 'foo' },
      flags: { projectToken: 'bar' },
    };
    expect(getDiagnostics(ctx as any)).toEqual({
      build: { number: 1, reportToken: undefined },
      flags: { projectToken: undefined },
    });
  });
});
