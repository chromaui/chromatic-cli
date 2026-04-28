import { afterEach, describe, expect, it, vi } from 'vitest';

import { createInMemoryChromaticApi } from '../../lib/ports/chromaticApiInMemoryAdapter';
import { exitCodes } from '../../lib/setExitCode';
import TestLogger from '../../lib/testLogger';
import type { Options } from '../../types';
import { runVerifyPhase, VerifyPhaseError } from './verify';

const baseEnvironment = {
  CHROMATIC_POLL_INTERVAL: 1,
  CHROMATIC_UPGRADE_TIMEOUT: 1000,
  STORYBOOK_VERIFY_TIMEOUT: 100,
};

const baseAnnounced = {
  id: 'build-id',
  number: 1,
  browsers: ['chrome'],
  status: 'ANNOUNCED',
  autoAcceptChanges: false,
  reportToken: 'report-token',
  features: { isReactNativeApp: false, uiTests: true, uiReview: true },
  app: { id: 'app-id', turboSnapAvailability: 'AVAILABLE' },
} as any;

const baseStorybook = {
  version: '7.0.0',
  configDir: '.storybook',
  staticDir: [] as string[],
  addons: [] as { name: string }[],
  builder: { name: 'webpack' },
  refs: {},
  baseDir: '',
} as any;

function makeManualClock(environment = baseEnvironment) {
  let now = 0;
  return {
    advance: (ms: number) => {
      now += ms;
    },
    clock: {
      now: () => now,
      since: (start: number) => now - start,
      sleep: vi.fn(async (ms: number) => {
        // The upgrade timeout sleep is paired with `Promise.race` against
        // the polling promise; let it hang so the polling resolves first.
        if (ms === environment.CHROMATIC_UPGRADE_TIMEOUT) {
          await new Promise(() => undefined);
          return;
        }
        now += ms;
      }),
    },
  };
}

function makeUi() {
  return {
    taskStart: vi.fn(),
    taskUpdate: vi.fn(),
    taskSucceed: vi.fn(),
    taskFail: vi.fn(),
    progress: vi.fn(),
    withTask: async (_t: any, fn: () => Promise<any>) => fn(),
  } as any;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('runVerifyPhase', () => {
  it('publishes the build, polls until started, and returns VerifiedState', async () => {
    const log = new TestLogger();
    const { clock } = makeManualClock();
    const ports = {
      chromatic: createInMemoryChromaticApi({
        publishBuild: { status: 'PUBLISHED', storybookUrl: 'https://sb.example.com' },
        startedBuilds: {
          1: { startedAt: 100, upgradeBuilds: [] },
        },
        verifiedBuilds: {
          1: {
            id: 'build-id',
            number: 1,
            status: 'IN_PROGRESS',
            webUrl: 'https://web.example.com',
            storybookUrl: 'https://sb.example.com',
            specCount: 1,
            componentCount: 1,
            testCount: 1,
            changeCount: 0,
            errorCount: 0,
            actualTestCount: 1,
            actualCaptureCount: 1,
            inheritedCaptureCount: 0,
            interactionTestFailuresCount: 0,
            autoAcceptChanges: false,
            features: { uiTests: true, uiReview: false, isReactNativeApp: false },
            app: { manageUrl: '', setupUrl: '' },
          } as any,
        },
      }),
      clock,
      ui: makeUi(),
    };
    const result = await runVerifyPhase({
      options: {} as Options,
      env: baseEnvironment,
      git: { matchesBranch: () => false },
      storybook: baseStorybook,
      announcedBuild: baseAnnounced,
      log,
      ports,
    });
    expect(result.storybookUrl).toBe('https://sb.example.com');
    expect(result.build.status).toBe('IN_PROGRESS');
    expect(result.skipSnapshots).toBeUndefined();
    expect(result.exitCodeIntent).toBeUndefined();
  });

  it('throws VerifyPhaseError(BUILD_FAILED) when publish status is FAILED', async () => {
    const log = new TestLogger();
    const { clock } = makeManualClock();
    const ports = {
      chromatic: createInMemoryChromaticApi({
        publishBuild: { status: 'FAILED', storybookUrl: '' },
      }),
      clock,
      ui: makeUi(),
    };
    await expect(
      runVerifyPhase({
        options: {} as Options,
        env: baseEnvironment,
        git: { matchesBranch: () => false },
        storybook: baseStorybook,
        announcedBuild: baseAnnounced,
        log,
        ports,
      })
    ).rejects.toMatchObject({ name: 'VerifyPhaseError', exitCode: exitCodes.BUILD_FAILED });
  });

  it('throws VerifyPhaseError(STORYBOOK_BROKEN) when build reports a failureReason', async () => {
    const log = new TestLogger();
    const { clock } = makeManualClock();
    const ports = {
      chromatic: createInMemoryChromaticApi({
        publishBuild: { status: 'PUBLISHED', storybookUrl: 'https://sb' },
        startedBuilds: { 1: { failureReason: 'Storybook is broken' } },
      }),
      clock,
      ui: makeUi(),
    };
    await expect(
      runVerifyPhase({
        options: {} as Options,
        env: baseEnvironment,
        git: { matchesBranch: () => false },
        storybook: baseStorybook,
        announcedBuild: baseAnnounced,
        log,
        ports,
      })
    ).rejects.toMatchObject({
      name: 'VerifyPhaseError',
      exitCode: exitCodes.STORYBOOK_BROKEN,
      userError: true,
    });
  });

  it('throws VerifyPhaseError(VERIFICATION_TIMEOUT) when build never starts', async () => {
    const log = new TestLogger();
    const manual = makeManualClock();
    // 10ms tick per sleep — the verification timeout is 5ms.
    const ports = {
      chromatic: createInMemoryChromaticApi({
        publishBuild: { status: 'PUBLISHED', storybookUrl: 'https://sb' },
        startedBuilds: { 1: { upgradeBuilds: [] } },
      }),
      clock: { ...manual.clock, sleep: vi.fn(async () => manual.advance(10)) },
      ui: makeUi(),
    };
    await expect(
      runVerifyPhase({
        options: {} as Options,
        env: { ...baseEnvironment, STORYBOOK_VERIFY_TIMEOUT: 5, CHROMATIC_POLL_INTERVAL: 1 },
        git: { matchesBranch: () => false },
        storybook: baseStorybook,
        announcedBuild: baseAnnounced,
        log,
        ports,
      })
    ).rejects.toMatchObject({
      name: 'VerifyPhaseError',
      exitCode: exitCodes.VERIFICATION_TIMEOUT,
    });
  });

  it('returns ACCOUNT_QUOTA_REACHED intent when wasLimited + exceededThreshold', async () => {
    const log = new TestLogger();
    const { clock } = makeManualClock();
    const verifiedBuild = {
      id: 'b',
      number: 1,
      status: 'IN_PROGRESS',
      webUrl: '',
      specCount: 1,
      componentCount: 1,
      testCount: 1,
      changeCount: 0,
      errorCount: 0,
      actualTestCount: 1,
      actualCaptureCount: 1,
      inheritedCaptureCount: 0,
      interactionTestFailuresCount: 0,
      autoAcceptChanges: false,
      wasLimited: true,
      features: { uiTests: true, uiReview: false, isReactNativeApp: false },
      app: { manageUrl: '', setupUrl: '', account: { exceededThreshold: true } },
    } as any;
    const ports = {
      chromatic: createInMemoryChromaticApi({
        publishBuild: { status: 'PUBLISHED', storybookUrl: 'https://sb' },
        startedBuilds: { 1: { startedAt: 1, upgradeBuilds: [] } },
        verifiedBuilds: { 1: verifiedBuild },
      }),
      clock,
      ui: makeUi(),
    };
    const result = await runVerifyPhase({
      options: {} as Options,
      env: baseEnvironment,
      git: { matchesBranch: () => false },
      storybook: baseStorybook,
      announcedBuild: baseAnnounced,
      log,
      ports,
    });
    expect(result.exitCodeIntent).toEqual({
      exitCode: exitCodes.ACCOUNT_QUOTA_REACHED,
      userError: true,
    });
  });

  it('returns OK intent + skipSnapshots for publish-only builds', async () => {
    const log = new TestLogger();
    const { clock } = makeManualClock();
    const verifiedBuild = {
      id: 'b',
      number: 1,
      status: 'IN_PROGRESS',
      webUrl: '',
      specCount: 1,
      componentCount: 1,
      testCount: 1,
      changeCount: 0,
      errorCount: 0,
      actualTestCount: 1,
      actualCaptureCount: 1,
      inheritedCaptureCount: 0,
      interactionTestFailuresCount: 0,
      autoAcceptChanges: false,
      features: { uiTests: false, uiReview: false, isReactNativeApp: false },
      app: { manageUrl: '', setupUrl: '' },
    } as any;
    const ports = {
      chromatic: createInMemoryChromaticApi({
        publishBuild: { status: 'PUBLISHED', storybookUrl: 'https://sb' },
        startedBuilds: { 1: { startedAt: 1, upgradeBuilds: [] } },
        verifiedBuilds: { 1: verifiedBuild },
      }),
      clock,
      ui: makeUi(),
    };
    const result = await runVerifyPhase({
      options: {} as Options,
      env: baseEnvironment,
      git: { matchesBranch: () => false },
      storybook: baseStorybook,
      announcedBuild: baseAnnounced,
      log,
      ports,
    });
    expect(result.isPublishOnly).toBe(true);
    expect(result.skipSnapshots).toBe(true);
    expect(result.exitCodeIntent).toEqual({ exitCode: exitCodes.OK, userError: false });
  });

  it('passes turboSnap status APPLIED when turboSnap has no bailReason', async () => {
    const log = new TestLogger();
    const { clock } = makeManualClock();
    const publishBuildSpy = vi.fn(async () => ({ status: 'PUBLISHED', storybookUrl: '' }));
    const ports = {
      chromatic: {
        ...createInMemoryChromaticApi({
          startedBuilds: { 1: { startedAt: 1, upgradeBuilds: [] } },
          verifiedBuilds: {
            1: {
              id: 'b',
              number: 1,
              status: 'IN_PROGRESS',
              webUrl: '',
              specCount: 1,
              componentCount: 1,
              testCount: 1,
              changeCount: 0,
              errorCount: 0,
              actualTestCount: 1,
              actualCaptureCount: 1,
              inheritedCaptureCount: 0,
              interactionTestFailuresCount: 0,
              autoAcceptChanges: false,
              features: { uiTests: true, uiReview: false, isReactNativeApp: false },
              app: { manageUrl: '', setupUrl: '' },
            } as any,
          },
        }),
        publishBuild: publishBuildSpy,
      } as any,
      clock,
      ui: makeUi(),
    };
    await runVerifyPhase({
      options: { onlyStoryNames: 'Foo' } as unknown as Options,
      env: baseEnvironment,
      git: { matchesBranch: () => false, replacementBuildIds: [['x', 'y']] },
      storybook: baseStorybook,
      announcedBuild: baseAnnounced,
      turboSnap: {},
      onlyStoryFiles: ['./a.stories.js'],
      log,
      ports,
    });
    expect(publishBuildSpy).toHaveBeenCalledWith(
      {
        id: 'build-id',
        input: {
          onlyStoryFiles: ['./a.stories.js'],
          onlyStoryNames: ['Foo'],
          replacementBuildIds: [['x', 'y']],
          turboSnapStatus: 'APPLIED',
        },
      },
      { reportToken: 'report-token' }
    );
  });

  it('exposes the VerifyPhaseError class', () => {
    expect(new VerifyPhaseError('x', exitCodes.BUILD_FAILED)).toBeInstanceOf(Error);
  });
});
