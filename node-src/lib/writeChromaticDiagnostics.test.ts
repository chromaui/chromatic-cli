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
    const ctx = {
      analytics: { client: { headers: { Authorization: 'Bearer secret' } } },
      argv: [],
      client: {},
      env: {},
      log: {},
      pkg: {},
      title: {},
    };
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

  it('preserves TurboSnap sets as JSON arrays', () => {
    const ctx = {
      turboSnap: {
        tracedPaths: new Set(['src/Button.ts\nsrc/Button.stories.tsx']),
        affectedModuleIds: new Set([17, './src/Button.ts']),
        changedDependencyNames: new Set(['react']),
      },
    };

    expect(getDiagnostics(ctx as any)).toEqual({
      turboSnap: {
        tracedPaths: ['src/Button.ts\nsrc/Button.stories.tsx'],
        affectedModuleIds: [17, './src/Button.ts'],
        changedDependencyNames: ['react'],
      },
    });
  });

  it('preserves project metadata dates as ISO strings', () => {
    const ctx = {
      projectMetadata: {
        creationDate: new Date('2025-01-02T03:04:05.000Z'),
        storybookCreationDate: new Date('2024-06-07T08:09:10.000Z'),
      },
    };

    expect(getDiagnostics(ctx as any)).toEqual({
      projectMetadata: {
        creationDate: '2025-01-02T03:04:05.000Z',
        storybookCreationDate: '2024-06-07T08:09:10.000Z',
      },
    });
  });

  it('preserves runtime error details', () => {
    const runtimeError = new Error('Failed to load preview');
    runtimeError.stack = 'Error: Failed to load preview\n    at preview.ts:1:1';

    expect(getDiagnostics({ runtimeErrors: [runtimeError] } as any)).toEqual({
      runtimeErrors: [
        {
          name: 'Error',
          message: 'Failed to load preview',
          stack: 'Error: Failed to load preview\n    at preview.ts:1:1',
        },
      ],
    });
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
