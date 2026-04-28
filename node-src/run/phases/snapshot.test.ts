import { afterEach, describe, expect, it, vi } from 'vitest';

import { createInMemoryChromaticApi } from '../../lib/ports/chromaticApiInMemoryAdapter';
import { exitCodes } from '../../lib/setExitCode';
import TestLogger from '../../lib/testLogger';
import type { Options } from '../../types';
import { runSnapshotPhase } from './snapshot';

vi.mock(import('@cli/waitForBuildToComplete'), async (importOriginal) => {
  const originalModule = await importOriginal();
  return { ...originalModule, default: vi.fn() };
});

const baseEnvironment = {
  CHROMATIC_POLL_INTERVAL: 0,
  CHROMATIC_OUTPUT_INTERVAL: 0,
  CHROMATIC_NOTIFY_SERVICE_URL: 'wss://test.com',
};

function makeBuild(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'b',
    number: 1,
    status: 'IN_PROGRESS',
    storybookUrl: 'https://sb',
    webUrl: 'https://web',
    reportToken: 'token',
    actualTestCount: 0,
    testCount: 0,
    inProgressCount: 0,
    autoAcceptChanges: false,
    app: { manageUrl: '', setupUrl: '' },
    ...overrides,
  };
}

function makePorts(overrides: { snapshotBuilds?: any; clock?: any } = {}) {
  const clock = overrides.clock ?? {
    now: () => 0,
    since: () => 0,
    sleep: vi.fn(async () => undefined),
  };
  return {
    chromatic: createInMemoryChromaticApi({ snapshotBuilds: overrides.snapshotBuilds ?? {} }),
    clock,
    errors: { captureException: vi.fn(), setTag: vi.fn(), setContext: vi.fn(), flush: vi.fn() },
    ui: {
      taskStart: vi.fn(),
      taskUpdate: vi.fn(),
      taskSucceed: vi.fn(),
      taskFail: vi.fn(),
      progress: vi.fn(),
      withTask: async (_t: any, fn: () => Promise<any>) => fn(),
    },
  } as any;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('runSnapshotPhase', () => {
  it('classifies PASSED build with OK exit code', async () => {
    const ports = makePorts({
      snapshotBuilds: {
        1: { id: 'b', status: 'PASSED', autoAcceptChanges: false, completedAt: 100 } as any,
      },
    });
    const result = await runSnapshotPhase({
      options: {} as Options,
      env: baseEnvironment,
      git: { matchesBranch: () => false },
      build: makeBuild(),
      log: new TestLogger(),
      ports,
    });
    expect(result.outcome).toBe('passed');
    expect(result.exitCodeIntent).toEqual({ exitCode: exitCodes.OK, userError: false });
    expect(result.build.status).toBe('PASSED');
  });

  it('classifies ACCEPTED as has-changes; sets BUILD_HAS_CHANGES when not exit-zero', async () => {
    const ports = makePorts({
      snapshotBuilds: {
        1: {
          id: 'b',
          status: 'ACCEPTED',
          autoAcceptChanges: false,
          completedAt: 100,
        } as any,
      },
    });
    const result = await runSnapshotPhase({
      options: {} as Options,
      env: baseEnvironment,
      git: { matchesBranch: () => false },
      build: makeBuild(),
      log: new TestLogger(),
      ports,
    });
    expect(result.outcome).toBe('has-changes');
    expect(result.exitCodeIntent).toEqual({
      exitCode: exitCodes.BUILD_HAS_CHANGES,
      userError: true,
    });
  });

  it('returns OK when has-changes + exitZeroOnChanges matches', async () => {
    const ports = makePorts({
      snapshotBuilds: {
        1: {
          id: 'b',
          status: 'PENDING',
          autoAcceptChanges: false,
          completedAt: 100,
        } as any,
      },
    });
    const result = await runSnapshotPhase({
      options: { exitZeroOnChanges: 'true' } as unknown as Options,
      env: baseEnvironment,
      git: { matchesBranch: () => false },
      build: makeBuild(),
      log: new TestLogger(),
      ports,
    });
    expect(result.outcome).toBe('has-changes');
    expect(result.exitCodeIntent).toEqual({ exitCode: exitCodes.OK, userError: false });
  });

  it('classifies BROKEN with BUILD_HAS_ERRORS', async () => {
    const ports = makePorts({
      snapshotBuilds: {
        1: { id: 'b', status: 'BROKEN', autoAcceptChanges: false, completedAt: 100 } as any,
      },
    });
    const result = await runSnapshotPhase({
      options: {} as Options,
      env: baseEnvironment,
      git: { matchesBranch: () => false },
      build: makeBuild(),
      log: new TestLogger(),
      ports,
    });
    expect(result.outcome).toBe('broken');
    expect(result.exitCodeIntent.exitCode).toBe(exitCodes.BUILD_HAS_ERRORS);
  });

  it('classifies CANCELLED with BUILD_WAS_CANCELED', async () => {
    const ports = makePorts({
      snapshotBuilds: {
        1: { id: 'b', status: 'CANCELLED', autoAcceptChanges: false, completedAt: 100 } as any,
      },
    });
    const result = await runSnapshotPhase({
      options: {} as Options,
      env: baseEnvironment,
      git: { matchesBranch: () => false },
      build: makeBuild(),
      log: new TestLogger(),
      ports,
    });
    expect(result.outcome).toBe('cancelled');
    expect(result.exitCodeIntent.exitCode).toBe(exitCodes.BUILD_WAS_CANCELED);
  });

  it('throws on unexpected build status', async () => {
    const ports = makePorts({
      snapshotBuilds: {
        1: { id: 'b', status: 'WEIRD', autoAcceptChanges: false, completedAt: 100 } as any,
      },
    });
    await expect(
      runSnapshotPhase({
        options: {} as Options,
        env: baseEnvironment,
        git: { matchesBranch: () => false },
        build: makeBuild(),
        log: new TestLogger(),
        ports,
      })
    ).rejects.toThrow(/Unexpected build status/);
  });

  it('polls until completedAt is set, then classifies', async () => {
    let count = 0;
    const ports = makePorts();
    ports.chromatic.getSnapshotBuild = vi.fn(async () => {
      count += 1;
      if (count < 3) return { id: 'b', status: 'IN_PROGRESS' } as any;
      return { id: 'b', status: 'PASSED', completedAt: 1, autoAcceptChanges: false } as any;
    });
    const result = await runSnapshotPhase({
      options: {} as Options,
      env: baseEnvironment,
      git: { matchesBranch: () => false },
      build: makeBuild({ actualTestCount: 0 }),
      log: new TestLogger(),
      ports,
    });
    expect(count).toBe(3);
    expect(result.outcome).toBe('passed');
  });

  it('emits onProgress events when there are tests in progress', async () => {
    const builds: any[] = [
      { id: 'b', status: 'IN_PROGRESS', inProgressCount: 2 },
      { id: 'b', status: 'PASSED', completedAt: 1, autoAcceptChanges: false, inProgressCount: 0 },
    ];
    const ports = makePorts();
    ports.chromatic.getSnapshotBuild = vi.fn(async () => builds.shift());
    const events: { cursor: number; total: number }[] = [];
    await runSnapshotPhase({
      options: { interactive: true } as Options,
      env: baseEnvironment,
      git: { matchesBranch: () => false },
      build: makeBuild({ actualTestCount: 4, testCount: 4 }),
      log: new TestLogger(),
      ports,
      onProgress: (event) => events.push({ cursor: event.cursor, total: event.total }),
    });
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].total).toBe(4);
  });
});
