import { AnalyticsEvent } from '@cli/analytics/events';
import * as Sentry from '@sentry/node';
import { execa as execaDefault, parseCommandString } from 'execa';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../../lib/testLogger';
import { buildStorybook } from './buildStorybook';

vi.mock('execa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('execa')>();
  return {
    ...actual,
    execa: vi.fn(() => Promise.resolve()),
  };
});

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => 'mock log content'),
  };
});
vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
}));

const execa = vi.mocked(execaDefault);

const baseContext = { options: {}, flags: {} } as any;

beforeEach(() => {
  execa.mockClear();
});

describe('buildStorybook', () => {
  it('runs the build command', async () => {
    const ctx = {
      ...baseContext,
      buildCommand: 'npm run build:storybook --script-args',
      env: { STORYBOOK_BUILD_TIMEOUT: 1000 },
      log: new TestLogger(),
      options: { storybookLogFile: 'build-storybook.log' },
    } as any;
    await buildStorybook(ctx);
    expect(ctx.buildLogFile).toMatch(/build-storybook\.log$/);
    const [cmd, ...args] = parseCommandString(ctx.buildCommand);
    expect(execa).toHaveBeenCalledWith(
      cmd,
      args,
      expect.objectContaining({ stdio: expect.any(Array) })
    );
    expect(ctx.log.debug).toHaveBeenCalledWith('Running build command:', ctx.buildCommand);
  });

  it('fails when build times out', async () => {
    const ctx = {
      ...baseContext,
      buildCommand: 'npm run build:storybook --script-args',
      options: { buildScriptName: '' },
      env: { STORYBOOK_BUILD_TIMEOUT: 0 },
      log: new TestLogger(),
    } as any;
    execa.mockReturnValue(new Promise((resolve) => setTimeout(resolve, 100)) as any);
    await expect(buildStorybook(ctx)).rejects.toThrow('Command failed');
    expect(ctx.log.error).toHaveBeenCalledWith(
      expect.stringContaining('Command timed out after 0ms')
    );
  });

  it('passes NODE_ENV=production', async () => {
    const ctx = {
      ...baseContext,
      buildCommand: 'npm run build:storybook --script-args',
      env: { STORYBOOK_BUILD_TIMEOUT: 1000 },
      log: new TestLogger(),
      options: { storybookLogFile: 'build-storybook.log' },
    } as any;
    await buildStorybook(ctx);
    const [cmd, ...args] = parseCommandString(ctx.buildCommand);
    expect(execa).toHaveBeenCalledWith(
      cmd,
      args,
      expect.objectContaining({
        env: { CI: '1', NODE_ENV: 'production', STORYBOOK_INVOKED_BY: 'chromatic' },
      })
    );
  });

  it('allows overriding NODE_ENV with STORYBOOK_NODE_ENV', async () => {
    const ctx = {
      ...baseContext,
      buildCommand: 'npm run build:storybook --script-args',
      env: { STORYBOOK_BUILD_TIMEOUT: 1000, STORYBOOK_NODE_ENV: 'test' },
      log: { debug: vi.fn() },
      options: { storybookLogFile: 'build-storybook.log' },
    } as any;
    await buildStorybook(ctx);
    const [cmd, ...args] = parseCommandString(ctx.buildCommand);
    expect(execa).toHaveBeenCalledWith(
      cmd,
      args,
      expect.objectContaining({
        env: { CI: '1', NODE_ENV: 'test', STORYBOOK_INVOKED_BY: 'chromatic' },
      })
    );
  });
});

describe('buildStorybook E2E', () => {
  // Error messages that we expect to result in the missing dependency error
  const missingDependencyErrorMessages = [
    { name: 'not found 1', error: 'Command not found: build-archive-storybook' },
    { name: 'not found 2', error: 'Command "build-archive-storybook" not found' },
    { name: 'npm not found', error: 'NPM error code E404\n\nMore error info' },
    {
      name: 'exit code not found',
      error: 'Command failed with exit code 127: some command\n\nsome error line\n\n',
    },
    {
      name: 'single line command failure',
      error:
        'Command failed with exit code 1: npm exec build-archive-storybook --output-dir /tmp/chromatic--4210-0cyodqfYZabe',
    },
  ];

  it.each(missingDependencyErrorMessages)(
    'fails with missing dependency error when error message is $name',
    async ({ error }) => {
      const ctx = {
        ...baseContext,
        buildCommand: 'npm exec build-archive-storybook',
        options: { buildScriptName: '', playwright: true },
        env: { STORYBOOK_BUILD_TIMEOUT: 0 },
        log: { debug: vi.fn(), error: vi.fn() },
      } as any;

      execa.mockRejectedValueOnce(new Error(error));
      await expect(buildStorybook(ctx)).rejects.toThrow('Command failed');
      expect(ctx.log.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to import `@chromatic-com/playwright`')
      );

      ctx.log.error.mockClear();
    }
  );

  it('fails with generic error message when not missing dependency error', async () => {
    const ctx = {
      ...baseContext,
      buildCommand: 'npm exec build-archive-storybook',
      options: { buildScriptName: '', playwright: true },
      env: { STORYBOOK_BUILD_TIMEOUT: 0 },
      log: { debug: vi.fn(), error: vi.fn() },
    } as any;

    const errorMessage =
      'Command failed with exit code 1: npm exec build-archive-storybook --output-dir /tmp/chromatic--4210-0cyodqfYZabe\n\nMore error message lines\n\nAnd more';
    execa.mockRejectedValueOnce(new Error(errorMessage));
    await expect(buildStorybook(ctx)).rejects.toThrow('Command failed');
    expect(ctx.log.error).not.toHaveBeenCalledWith(
      expect.stringContaining('Failed to import `@chromatic-com/playwright`')
    );
    expect(ctx.log.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to run `chromatic --playwright`')
    );
    expect(ctx.log.error).toHaveBeenCalledWith(expect.stringContaining(errorMessage));
  });
});

function makeAnalyticsContext(overrides = {}) {
  return {
    ...baseContext,
    buildCommand: 'npm run build:storybook',
    env: { STORYBOOK_BUILD_TIMEOUT: 0 },
    log: new TestLogger(),
    pkg: { version: '1.0.0' },
    storybook: { version: '8.0.0' },
    git: { gitUserEmail: 'test@example.com', ciService: 'github-actions' },
    announcedBuild: { app: { id: 'app-123', account: { id: 'account-456' } } },
    analytics: { trackEvent: vi.fn(), shutdown: vi.fn() },
    ...overrides,
  } as any;
}

describe('buildStorybook analytics', () => {
  it('tracks storybook_build_failed on build failure', async () => {
    // arrange
    const ctx = makeAnalyticsContext();
    execa.mockRejectedValueOnce(new Error('build failed'));

    // act
    await expect(buildStorybook(ctx)).rejects.toThrow();

    // assert
    expect(ctx.analytics.trackEvent).toHaveBeenCalledWith(
      AnalyticsEvent.CLI_STORYBOOK_BUILD_FAILED,
      expect.objectContaining({
        errorCategory: 'storybook_build_failed',
        buildCommand: 'npm run build:storybook',
        source: 'cli',
        cliVersion: '1.0.0',
        storybookVersion: '8.0.0',
        isCI: expect.any(Boolean),
        ciService: 'github-actions',
        gitUserEmailHash: expect.any(String),
      })
    );
  });

  it('tracks e2e_missing_dependency when E2E dependency is not found', async () => {
    // arrange
    const ctx = makeAnalyticsContext({ options: { playwright: true, buildScriptName: '' } });
    execa.mockRejectedValueOnce(new Error('Command not found: build-archive-storybook'));

    // act
    await expect(buildStorybook(ctx)).rejects.toThrow();

    // assert
    expect(ctx.analytics.trackEvent).toHaveBeenCalledWith(
      AnalyticsEvent.CLI_STORYBOOK_BUILD_FAILED,
      expect.objectContaining({ errorCategory: 'e2e_missing_dependency' })
    );
  });

  it('tracks e2e_build_failed on generic E2E build failure', async () => {
    // arrange
    const ctx = makeAnalyticsContext({ options: { playwright: true, buildScriptName: '' } });
    const error = 'Command failed with exit code 1: build-archive-storybook\n\nMultiple lines';
    execa.mockRejectedValueOnce(new Error(`${error}\n\nOf error`));

    // act
    await expect(buildStorybook(ctx)).rejects.toThrow();

    // assert
    expect(ctx.analytics.trackEvent).toHaveBeenCalledWith(
      AnalyticsEvent.CLI_STORYBOOK_BUILD_FAILED,
      expect.objectContaining({ errorCategory: 'e2e_build_failed' })
    );
  });

  it('tracks aborted when build is cancelled via abort signal', async () => {
    // arrange
    const controller = new AbortController();
    controller.abort();
    const ctx = makeAnalyticsContext({
      options: { experimental_abortSignal: controller.signal, buildScriptName: '' },
    });
    execa.mockRejectedValueOnce(new Error('aborted'));

    // act
    await expect(buildStorybook(ctx)).rejects.toThrow();

    // assert
    expect(ctx.analytics.trackEvent).toHaveBeenCalledWith(
      AnalyticsEvent.CLI_STORYBOOK_BUILD_FAILED,
      expect.objectContaining({ errorCategory: 'aborted' })
    );
  });

  it('sanitizes the stack trace before sending', async () => {
    // arrange
    const ctx = makeAnalyticsContext();
    const err = new Error('build failed');
    err.stack = 'Error: build failed\n    at x (/Users/user/secret/project/file.js:1:1)';
    execa.mockRejectedValueOnce(err);

    // act
    await expect(buildStorybook(ctx)).rejects.toThrow();

    // assert
    expect(ctx.analytics.trackEvent).toHaveBeenCalledWith(
      AnalyticsEvent.CLI_STORYBOOK_BUILD_FAILED,
      expect.objectContaining({
        stackTrace: 'Error: build failed\n    at x (<path>/file.js:1:1)',
      })
    );
  });

  it('reports to Sentry and still throws the build failure when analytics throws', async () => {
    // arrange
    vi.mocked(Sentry.captureException).mockClear();
    const analyticsError = new Error('analytics exploded');
    const ctx = makeAnalyticsContext({
      analytics: {
        trackEvent: vi.fn(() => {
          throw analyticsError;
        }),
        shutdown: vi.fn(),
      },
    });
    execa.mockRejectedValueOnce(new Error('build failed'));

    // act
    const thrown = await buildStorybook(ctx).catch((err) => err);

    // assert: outer throw is the build failure, not the analytics failure
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBe(analyticsError);
    expect(Sentry.captureException).toHaveBeenCalledWith(analyticsError);
  });
});
