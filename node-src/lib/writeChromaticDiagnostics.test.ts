import path from 'path';
import { describe, expect, it, vi } from 'vitest';

import { createLogger } from './log';
import { getDiagnostics, writeChromaticDiagnostics } from './writeChromaticDiagnostics';

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
      extraOptions: { userToken: 'baz' },
    };
    expect(getDiagnostics(ctx as any)).toEqual({
      build: { number: 1, reportToken: undefined },
      flags: { projectToken: undefined },
      extraOptions: { userToken: undefined },
    });
  });
});

describe('writeChromaticDiagnostics', () => {
  it('should create the parent directory if it does not exist', async () => {
    const mkdir = vi.fn(async () => {});
    const writeFile = vi.fn(async () => {});
    const ctx = {
      log: createLogger(),
      options: { diagnosticsFile: '/tmp/doesnotexist/diagnostics.json' },
      ports: { fs: { mkdir, writeFile } } as any,
    };
    await writeChromaticDiagnostics(ctx as any);

    expect(mkdir).toHaveBeenCalledWith(path.dirname(ctx.options.diagnosticsFile), {
      recursive: true,
    });
    expect(writeFile).toHaveBeenCalledWith(ctx.options.diagnosticsFile, expect.any(String));
  });
});
