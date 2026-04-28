import { afterEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../testLogger';
import type { DetectedStorybookInfo, StorybookDetector } from './storybookDetector';
import {
  createInMemoryStorybookDetector,
  InMemoryStorybookDetectorState,
} from './storybookDetectorInMemoryAdapter';
import { createRealStorybookDetector } from './storybookDetectorRealAdapter';

vi.mock('../getStorybookInfo', () => ({ default: vi.fn() }));

const realModule = await import('../getStorybookInfo');
const realDetect = vi.mocked(realModule.default);

interface AdapterSetup {
  adapter: StorybookDetector;
  primeOk: (sourceDirectory: string, info: DetectedStorybookInfo) => void;
  primeError: (error: Error) => void;
}

function realSetup(): AdapterSetup {
  const responses = new Map<string, DetectedStorybookInfo>();
  let pendingError: Error | undefined;
  realDetect.mockImplementation(async (ctx: any) => {
    if (pendingError) {
      const err = pendingError;
      pendingError = undefined;
      throw err;
    }
    return responses.get(ctx.sourceDir) ?? {};
  });
  return {
    adapter: createRealStorybookDetector(),
    primeOk: (sourceDirectory, info) => responses.set(sourceDirectory, info),
    primeError: (error) => {
      pendingError = error;
    },
  };
}

function inMemorySetup(): AdapterSetup {
  const state: InMemoryStorybookDetectorState = { bySourceDir: new Map() };
  return {
    adapter: createInMemoryStorybookDetector(state),
    primeOk: (sourceDirectory, info) => state.bySourceDir?.set(sourceDirectory, info),
    primeError: (error) => {
      state.error = error;
    },
  };
}

const adapters = [
  ['real', realSetup],
  ['in-memory', inMemorySetup],
] as const;

function makeContext(overrides: Record<string, any> = {}) {
  return {
    log: new TestLogger(),
    options: {},
    packageJson: {},
    sourceDir: '/project',
    git: { rootDir: '/project' },
    ...overrides,
  } as any;
}

describe.each(adapters)('StorybookDetector (%s)', (_name, makeSetup) => {
  afterEach(() => {
    vi.clearAllMocks();
    realDetect.mockReset();
  });

  it('returns the detected storybook info', async () => {
    const { adapter, primeOk } = makeSetup();
    const info: DetectedStorybookInfo = {
      version: '7.6.0',
      addons: [{ name: 'essentials' }],
      builder: { name: 'webpack5' },
    };
    primeOk('/project', info);
    const result = await adapter.detect(makeContext());
    expect(result).toEqual(info);
  });

  it('returns an empty object when nothing is detected', async () => {
    const { adapter } = makeSetup();
    const result = await adapter.detect(makeContext({ sourceDir: '/elsewhere' }));
    expect(result).toEqual({});
  });

  it('propagates detection errors', async () => {
    const { adapter, primeError } = makeSetup();
    primeError(new Error('mainConfig parse failed'));
    await expect(adapter.detect(makeContext())).rejects.toThrow(/mainConfig parse failed/);
  });
});
