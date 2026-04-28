import { describe, expect, it, vi } from 'vitest';

import TestLogger from '../lib/testLogger';
import { Context } from '../types';
import { ChromaticRun } from './chromaticRun';
import { ChromaticConfig, RunEvent } from './types';

const { runAllMock } = vi.hoisted(() => ({ runAllMock: vi.fn() }));

vi.mock('..', async () => {
  const actual = await vi.importActual<typeof import('..')>('..');
  return { ...actual, runAll: runAllMock };
});

vi.mock('read-package-up', () => ({
  readPackageUp: vi.fn(async () => ({
    path: '/repo/package.json',
    packageJson: { name: 'demo', version: '1.2.3' },
  })),
}));

const log = new TestLogger();

function makeConfig(overrides: Partial<ChromaticConfig> = {}): ChromaticConfig {
  return {
    log,
    sessionId: 'session-1',
    ...overrides,
  } as unknown as ChromaticConfig;
}

function primeRunAllPipeline(extra?: (context: Context) => void) {
  runAllMock.mockReset();
  runAllMock.mockImplementation(async (context: Context) => {
    context.exitCode = 0;
    context.exitCodeKey = 'OK';
    extra?.(context);
  });
}

describe('ChromaticRun', () => {
  it('throws on state access before execute()', () => {
    const run = new ChromaticRun({ config: makeConfig() });
    expect(() => run.state).toThrow(/execute/);
  });

  it('builds a Context, runs the pipeline, and projects the RunResult', async () => {
    primeRunAllPipeline((context) => {
      context.build = {
        id: 'b1',
        number: 7,
        status: 'PASSED',
        webUrl: 'https://example.com/build/7',
        storybookUrl: 'https://sb.example.com',
        specCount: 3,
        componentCount: 1,
        testCount: 3,
        changeCount: 0,
        errorCount: 0,
        accessibilityChangeCount: 0,
        interactionTestFailuresCount: 0,
        autoAcceptChanges: false,
        actualCaptureCount: 3,
        actualTestCount: 3,
        inheritedCaptureCount: 0,
        app: { manageUrl: '', setupUrl: '' },
        reportToken: 'r',
      } as Context['build'];
    });

    const run = new ChromaticRun({ config: makeConfig() });
    const result = await run.execute();

    expect(runAllMock).toHaveBeenCalledOnce();
    const [contextArgument] = runAllMock.mock.calls[0];
    expect(contextArgument.sessionId).toBe('session-1');
    expect(contextArgument.packagePath).toBe('/repo/package.json');
    expect(contextArgument.packageJson).toEqual({ name: 'demo', version: '1.2.3' });
    expect(contextArgument.ports).toBeDefined();
    expect(contextArgument.ports.git).toBeDefined();
    expect(contextArgument.extraOptions.experimental_onTaskStart).toBeTypeOf('function');
    expect(contextArgument.extraOptions.experimental_onTaskComplete).toBeTypeOf('function');

    expect(result.exitCode).toBe(0);
    expect(result.exitCodeKey).toBe('OK');
    expect(result.build).toMatchObject({ id: 'b1', number: 7, webUrl: expect.any(String) });
    expect(result.storybookUrl).toBe('https://sb.example.com');
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.diagnostics.sessionId).toBe('session-1');
    expect(result.diagnostics.phasesRun).toEqual([]);
  });

  it('exposes a frozen state snapshot after execute()', async () => {
    primeRunAllPipeline();

    const run = new ChromaticRun({ config: makeConfig() });
    await run.execute();

    const state = run.state;
    expect(state.sessionId).toBe('session-1');
    expect(Object.isFrozen(state)).toBe(true);
    expect(() => {
      (state as { sessionId: string }).sessionId = 'tampered';
    }).toThrow();
  });

  it('forwards onEvent for wrapped task lifecycle callbacks', async () => {
    const events: RunEvent[] = [];
    primeRunAllPipeline((context) => {
      const fakeTaskContext = {
        task: 'auth',
        title: 'Authenticating',
        startedAt: 1000,
      } as Context;
      const start = context.extraOptions?.experimental_onTaskStart;
      const complete = context.extraOptions?.experimental_onTaskComplete;
      start?.(fakeTaskContext);
      complete?.(fakeTaskContext);
    });

    const onEvent = vi.fn((event: RunEvent) => events.push(event));
    const run = new ChromaticRun({ config: makeConfig(), onEvent });
    const result = await run.execute();

    expect(events[0]).toEqual({ type: 'phase:start', phase: 'auth', title: 'Authenticating' });
    expect(events[1]).toMatchObject({ type: 'phase:end', phase: 'auth', skipped: false });
    expect(result.diagnostics.phasesRun).toEqual(['auth']);
  });

  it('preserves caller-supplied experimental task callbacks alongside event emission', async () => {
    const callerStart = vi.fn();
    const callerComplete = vi.fn();
    primeRunAllPipeline((context) => {
      const fakeTaskContext = { task: 'gitInfo', title: 'Git', startedAt: 0 } as Context;
      context.extraOptions?.experimental_onTaskStart?.(fakeTaskContext);
      context.extraOptions?.experimental_onTaskComplete?.(fakeTaskContext);
    });

    const onEvent = vi.fn();
    const run = new ChromaticRun({
      config: makeConfig({
        experimental_onTaskStart: callerStart,
        experimental_onTaskComplete: callerComplete,
      }),
      onEvent,
    });
    await run.execute();

    expect(callerStart).toHaveBeenCalledOnce();
    expect(callerComplete).toHaveBeenCalledOnce();
    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  it('lets ports overrides win over the default ports', async () => {
    primeRunAllPipeline();

    const fakeClock = { now: vi.fn(() => 42), since: vi.fn(), sleep: vi.fn() };
    const run = new ChromaticRun({
      config: makeConfig(),
      ports: { clock: fakeClock as any },
    });
    await run.execute();

    expect(runAllMock.mock.calls[0][0].ports.clock).toBe(fakeClock);
  });

  it('forwards an AbortSignal to extraOptions', async () => {
    primeRunAllPipeline();

    const controller = new AbortController();
    const run = new ChromaticRun({ config: makeConfig() });
    await run.execute(controller.signal);

    expect(runAllMock.mock.calls[0][0].extraOptions.experimental_abortSignal).toBe(
      controller.signal
    );
  });
});
