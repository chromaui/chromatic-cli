import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../testLogger';
import type { AffectedModules, DependencyTracer } from './dependencyTracer';
import {
  createInMemoryDependencyTracer,
  InMemoryDependencyTracerState,
} from './dependencyTracerInMemoryAdapter';
import { createTurbosnapDependencyTracer } from './dependencyTracerTurbosnapAdapter';

vi.mock('../turbosnap', () => ({
  traceChangedFiles: vi.fn(),
}));

const turbosnapModule = await import('../turbosnap');
const turbosnapTrace = vi.mocked(turbosnapModule.traceChangedFiles);

interface AdapterSetup {
  adapter: DependencyTracer;
  primeOk: (statsPath: string, onlyStoryFiles: AffectedModules) => void;
  primeBail: (statsPath: string, bailReason: NonNullable<unknown>) => void;
  primeError: (statsPath: string, error: Error) => void;
}

function turbosnapSetup(): AdapterSetup {
  const adapter = createTurbosnapDependencyTracer();
  const responses = new Map<
    string,
    { onlyStoryFiles?: AffectedModules; bailReason?: any; error?: Error }
  >();
  turbosnapTrace.mockImplementation(async (ctx: any) => {
    if (!ctx.fileInfo?.statsPath) {
      ctx.turboSnap.bailReason = { missingStatsFile: true };
      throw new Error('Missing preview-stats.json');
    }
    const response = responses.get(ctx.fileInfo.statsPath);
    if (response?.error) throw response.error;
    if (response?.bailReason) {
      ctx.turboSnap.bailReason = response.bailReason;
      return undefined;
    }
    return response?.onlyStoryFiles;
  });
  return {
    adapter,
    primeOk: (statsPath, onlyStoryFiles) => responses.set(statsPath, { onlyStoryFiles }),
    primeBail: (statsPath, bailReason) => responses.set(statsPath, { bailReason }),
    primeError: (statsPath, error) => responses.set(statsPath, { error }),
  };
}

function inMemorySetup(): AdapterSetup {
  const state: InMemoryDependencyTracerState = { byStatsPath: new Map() };
  return {
    adapter: createInMemoryDependencyTracer(state),
    primeOk: (statsPath, onlyStoryFiles) => state.byStatsPath?.set(statsPath, { onlyStoryFiles }),
    primeBail: (statsPath, bailReason) => state.byStatsPath?.set(statsPath, { bailReason }),
    primeError: (statsPath, error) => state.byStatsPath?.set(statsPath, { error }),
  };
}

const adapters = [
  ['turbosnap', turbosnapSetup],
  ['in-memory', inMemorySetup],
] as const;

function makeContext(overrides: Record<string, any> = {}) {
  return {
    log: new TestLogger(),
    options: {},
    env: {},
    git: { changedFiles: ['./changed.ts'] },
    storybook: { version: '8.0.0' },
    turboSnap: {},
    fileInfo: { statsPath: '/build/preview-stats.json' },
    ...overrides,
  } as any;
}

describe.each(adapters)('DependencyTracer (%s)', (_name, makeSetup) => {
  beforeEach(() => {
    turbosnapTrace.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns the affected-modules map when the trace succeeds', async () => {
    const { adapter, primeOk } = makeSetup();
    const map = { '123': ['./example.stories.ts'] };
    primeOk('/build/preview-stats.json', map);
    const ctx = makeContext();
    const result = await adapter.traceChangedFiles(ctx);
    expect(result).toEqual(map);
  });

  it('bails when stats file is missing and records the bail reason', async () => {
    const { adapter } = makeSetup();
    const ctx = makeContext({ fileInfo: undefined });
    await expect(adapter.traceChangedFiles(ctx)).rejects.toThrow(/preview-stats\.json/);
    expect(ctx.turboSnap.bailReason).toEqual({ missingStatsFile: true });
  });

  it('returns undefined and surfaces a bail reason when the trace bails', async () => {
    const { adapter, primeBail } = makeSetup();
    primeBail('/build/preview-stats.json', { changedPackageFiles: ['package.json'] });
    const ctx = makeContext();
    const result = await adapter.traceChangedFiles(ctx);
    expect(result).toBeUndefined();
    expect(ctx.turboSnap.bailReason).toEqual({ changedPackageFiles: ['package.json'] });
  });

  it('rejects when dependency tracing throws', async () => {
    const { adapter, primeError } = makeSetup();
    primeError('/build/preview-stats.json', new Error('Could not parse lockfile'));
    const ctx = makeContext();
    await expect(adapter.traceChangedFiles(ctx)).rejects.toThrow(/Could not parse lockfile/);
  });
});
