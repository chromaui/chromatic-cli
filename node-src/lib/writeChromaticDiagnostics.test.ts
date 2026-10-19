import { mkdirSync, rmSync } from 'fs';
import jsonfile from 'jsonfile';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

import { createLogger } from './log';
import {
  getDiagnostics,
  removeChromaticDiagnostics,
  writeChromaticDiagnostics,
} from './writeChromaticDiagnostics';

vi.mock('jsonfile');
vi.mock('fs');

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

  it('omits the analytics client and any credentials it holds', () => {
    const token = 'chpt_secret-token-value';
    const ctx = {
      analytics: {
        client: {
          headers: { Authorization: `Bearer ${token}` },
          client: { env: { CHROMATIC_PROJECT_TOKEN: token } },
        },
      },
      build: { number: 1 },
    };
    const diagnostics = getDiagnostics(ctx as any);

    expect(diagnostics).not.toHaveProperty('analytics');
    const serialized = JSON.stringify(diagnostics);
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain('Bearer ');
  });

  it('redacts token values inside originalArgv and keeps flag names intact', () => {
    const token = 'chpt_secret-token-value';
    const ctx = {
      options: {
        projectToken: token,
        originalArgv: [
          '-t',
          token,
          `-t=${token}`,
          '--project-token',
          token,
          `--project-token=${token}`,
          '-t',
          token,
        ],
      },
    };
    const diagnostics = getDiagnostics(ctx as any);

    expect(JSON.stringify(diagnostics)).not.toContain(token);
    expect((diagnostics as any).options.originalArgv).toEqual([
      '-t',
      '<redacted>',
      '-t=<redacted>',
      '--project-token',
      '<redacted>',
      '--project-token=<redacted>',
      '-t',
      '<redacted>',
    ]);
  });

  it('redacts collected secret values wherever they appear, regardless of key name', () => {
    const token = 'chpt_secret-token-value';
    const ctx = {
      build: { number: 1, note: `deployed with ${token} just now` },
      options: { projectToken: token },
    };
    const diagnostics = getDiagnostics(ctx as any);

    expect(JSON.stringify(diagnostics)).not.toContain(token);
    expect((diagnostics as any).build.note).toBe('deployed with <redacted> just now');
  });

  it('replaces Bearer authorization values with the placeholder', () => {
    const ctx = { extraOptions: { someHeader: 'Bearer eyJhbGciOi.some.signature' } };
    const diagnostics = getDiagnostics(ctx as any);

    expect((diagnostics as any).extraOptions.someHeader).toBe('<redacted>');
  });
});

describe('writeChromaticDiagnostics', () => {
  it('should create the parent directory if it does not exist', async () => {
    const ctx = {
      log: createLogger(),
      options: { diagnosticsFile: '/tmp/doesnotexist/diagnostics.json' },
    };
    await writeChromaticDiagnostics(ctx as any);

    expect(mkdirSync).toHaveBeenCalledWith(path.dirname(ctx.options.diagnosticsFile), {
      recursive: true,
    });
    expect(jsonfile.writeFile).toHaveBeenCalledWith(
      ctx.options.diagnosticsFile,
      expect.any(Object),
      expect.any(Object)
    );
  });
});

describe('removeChromaticDiagnostics', () => {
  it('removes the configured diagnostics file', () => {
    const ctx = {
      log: createLogger(),
      options: { diagnosticsFile: 'chromatic-diagnostics.json' },
    };
    removeChromaticDiagnostics(ctx as any);

    expect(rmSync).toHaveBeenCalledWith('chromatic-diagnostics.json', { force: true });
  });

  it('does nothing when no diagnostics file is configured', () => {
    const ctx = { log: createLogger(), options: {} };
    removeChromaticDiagnostics(ctx as any);

    expect(rmSync).not.toHaveBeenCalled();
  });
});
