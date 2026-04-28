import { AnalyticsEvent } from '@cli/analytics/events';
import { PassThrough } from 'stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as e2eModule from '../../lib/e2e';
import { exitCodes } from '../../lib/setExitCode';
import TestLogger from '../../lib/testLogger';
import type { Options } from '../../types';
import { BuildPhaseError, runBuildPhase } from './build';

vi.mock('../../lib/e2e');

const getE2EBuildCommand = vi.mocked(e2eModule.getE2EBuildCommand);

beforeEach(() => {
  getE2EBuildCommand.mockResolvedValue('node /bin/playwright-build --output-dir=/tmp/sb');
});

afterEach(() => {
  vi.clearAllMocks();
});

function makeFakes(
  overrides: {
    fs?: any;
    builder?: any;
    analytics?: any;
    errors?: any;
    host?: any;
    pkgMgr?: any;
  } = {}
) {
  const log = new TestLogger();
  const ports = {
    fs: {
      mkdtemp: vi.fn(async () => ({ path: '/tmp/chromatic-stub', cleanup: async () => {} })),
      createWriteStream: vi.fn(() => {
        const stream = new PassThrough() as any;
        setImmediate(() => stream.emit('open'));
        return stream;
      }),
      readFile: vi.fn(async () => 'log contents'),
      exists: vi.fn(async () => true),
      ...overrides.fs,
    },
    builder: { build: vi.fn(async () => undefined), ...overrides.builder },
    pkgMgr: {
      getRunCommand: vi.fn(async (args: string[]) => `npm run ${args.join(' ')}`),
      ...overrides.pkgMgr,
    },
    analytics: { track: vi.fn(), flush: vi.fn(async () => undefined), ...overrides.analytics },
    errors: {
      captureException: vi.fn(),
      setTag: vi.fn(),
      setContext: vi.fn(),
      flush: vi.fn(async () => true),
      ...overrides.errors,
    },
    host: {
      cwd: () => '/cwd',
      get: vi.fn((key: string) => (key === 'CI' ? '1' : undefined)),
      platform: () => process.platform,
      nodeVersion: () => process.versions.node,
      all: () => process.env as Record<string, string>,
      ci: () => undefined,
      ...overrides.host,
    },
  } as any;
  return { log, ports };
}

const baseEnvironment = { STORYBOOK_BUILD_TIMEOUT: 1000, STORYBOOK_NODE_ENV: 'production' };
const basePackage = { version: '1.0.0' };

describe('runBuildPhase', () => {
  it('returns the pre-set sourceDir as-is for React Native apps', async () => {
    const { log, ports } = makeFakes();
    const artifacts = await runBuildPhase({
      options: {} as Options,
      env: baseEnvironment,
      git: {} as any,
      packageJson: {},
      pkg: basePackage,
      isReactNativeApp: true,
      sourceDir: '/path/to/rn-build',
      log,
      ports,
    });
    expect(artifacts).toEqual({ sourceDir: '/path/to/rn-build' });
    expect(ports.builder.build).not.toHaveBeenCalled();
  });

  it('throws BuildPhaseError when React Native build has no sourceDir', async () => {
    const { log, ports } = makeFakes();
    await expect(
      runBuildPhase({
        options: {} as Options,
        env: baseEnvironment,
        git: {} as any,
        packageJson: {},
        pkg: basePackage,
        isReactNativeApp: true,
        log,
        ports,
      })
    ).rejects.toBeInstanceOf(BuildPhaseError);
  });

  it('resolves a tmp source dir and runs builder with NODE_ENV=production by default', async () => {
    const { log, ports } = makeFakes();
    const artifacts = await runBuildPhase({
      options: { buildScriptName: 'build:storybook' } as Options,
      env: baseEnvironment,
      storybook: { version: '7.0.0' },
      git: {} as any,
      packageJson: {},
      pkg: basePackage,
      log,
      ports,
    });
    expect(artifacts.sourceDir).toBe('/tmp/chromatic-stub');
    expect(artifacts.buildCommand).toBe('npm run build:storybook --output-dir=/tmp/chromatic-stub');
    expect(ports.builder.build).toHaveBeenCalledWith(
      expect.objectContaining({
        command: artifacts.buildCommand,
        outputDir: '/tmp/chromatic-stub',
        timeoutMs: 1000,
        env: { CI: '1', NODE_ENV: 'production', STORYBOOK_INVOKED_BY: 'chromatic' },
      })
    );
  });

  it('uses storybook-static for old storybooks', async () => {
    const { log, ports } = makeFakes();
    const artifacts = await runBuildPhase({
      options: { buildScriptName: 'build:storybook' } as Options,
      env: baseEnvironment,
      storybook: { version: '4.0.0' },
      git: {} as any,
      packageJson: {},
      pkg: basePackage,
      log,
      ports,
    });
    expect(artifacts.sourceDir).toBe('storybook-static');
  });

  it('honors the explicit outputDir option', async () => {
    const { log, ports } = makeFakes();
    const artifacts = await runBuildPhase({
      options: { buildScriptName: 'build:storybook', outputDir: 'storybook-out' } as Options,
      env: baseEnvironment,
      storybook: { version: '7.0.0' },
      git: {} as any,
      packageJson: {},
      pkg: basePackage,
      log,
      ports,
    });
    expect(artifacts.sourceDir).toBe('storybook-out');
  });

  it('respects STORYBOOK_NODE_ENV override', async () => {
    const { log, ports } = makeFakes();
    await runBuildPhase({
      options: { buildScriptName: 'build:storybook' } as Options,
      env: { STORYBOOK_BUILD_TIMEOUT: 1000, STORYBOOK_NODE_ENV: 'test' },
      storybook: { version: '7.0.0' },
      git: {} as any,
      packageJson: {},
      pkg: basePackage,
      log,
      ports,
    });
    expect(ports.builder.build).toHaveBeenCalledWith(
      expect.objectContaining({
        env: { CI: '1', NODE_ENV: 'test', STORYBOOK_INVOKED_BY: 'chromatic' },
      })
    );
  });

  it('opens a build log file when storybookLogFile is requested', async () => {
    const { log, ports } = makeFakes();
    const artifacts = await runBuildPhase({
      options: { buildScriptName: 'build:storybook', storybookLogFile: 'build.log' } as Options,
      env: baseEnvironment,
      storybook: { version: '7.0.0' },
      git: {} as any,
      packageJson: {},
      pkg: basePackage,
      log,
      ports,
    });
    expect(artifacts.buildLogFile).toMatch(/build\.log$/);
    expect(ports.fs.createWriteStream).toHaveBeenCalled();
  });

  it('translates a non-E2E build failure into a BuildPhaseError with the build exit code', async () => {
    const builder = { build: vi.fn().mockRejectedValueOnce(new Error('build failed')) };
    const { log, ports } = makeFakes({ builder });
    await expect(
      runBuildPhase({
        options: { buildScriptName: 'build:storybook' } as Options,
        env: baseEnvironment,
        storybook: { version: '7.0.0' },
        git: {} as any,
        packageJson: {},
        pkg: basePackage,
        log,
        ports,
      })
    ).rejects.toMatchObject({
      name: 'BuildPhaseError',
      exitCode: exitCodes.NPM_BUILD_STORYBOOK_FAILED,
    });
  });

  it('translates an E2E missing-dep failure into BuildPhaseError(MISSING_DEPENDENCY)', async () => {
    const builder = {
      build: vi.fn().mockRejectedValueOnce(new Error('Command not found: build-archive-storybook')),
    };
    const { log, ports } = makeFakes({ builder });
    getE2EBuildCommand.mockResolvedValue('node /bin/playwright-build --output-dir=/tmp/sb');
    await expect(
      runBuildPhase({
        options: { playwright: true } as Options,
        env: baseEnvironment,
        storybook: { version: '7.0.0' },
        git: {} as any,
        packageJson: {},
        pkg: basePackage,
        log,
        ports,
      })
    ).rejects.toMatchObject({
      name: 'BuildPhaseError',
      exitCode: exitCodes.MISSING_DEPENDENCY,
    });
  });

  it('translates a generic E2E failure into BuildPhaseError(E2E_BUILD_FAILED)', async () => {
    const builder = {
      build: vi.fn().mockRejectedValueOnce(new Error('Command failed: random thing')),
    };
    const { log, ports } = makeFakes({ builder });
    await expect(
      runBuildPhase({
        options: { playwright: true } as Options,
        env: baseEnvironment,
        storybook: { version: '7.0.0' },
        git: {} as any,
        packageJson: {},
        pkg: basePackage,
        log,
        ports,
      })
    ).rejects.toMatchObject({
      name: 'BuildPhaseError',
      exitCode: exitCodes.E2E_BUILD_FAILED,
    });
  });

  it('rethrows abort errors when signal is aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const builder = { build: vi.fn().mockRejectedValueOnce(new Error('aborted')) };
    const { log, ports } = makeFakes({ builder });
    await expect(
      runBuildPhase({
        options: { buildScriptName: 'build:storybook' } as Options,
        env: baseEnvironment,
        storybook: { version: '7.0.0' },
        git: {} as any,
        packageJson: {},
        pkg: basePackage,
        log,
        ports,
        signal: controller.signal,
      })
    ).rejects.toThrow();
  });

  it('emits storybook_build_failed analytics on non-E2E failure', async () => {
    const builder = { build: vi.fn().mockRejectedValueOnce(new Error('build failed')) };
    const { log, ports } = makeFakes({ builder });
    await runBuildPhase({
      options: { buildScriptName: 'build:storybook' } as Options,
      env: baseEnvironment,
      storybook: { version: '8.0.0' },
      git: { ciService: 'github-actions', gitUserEmail: 'tester@example.com' } as any,
      packageJson: {},
      pkg: basePackage,
      log,
      ports,
    }).catch(() => undefined);
    expect(ports.analytics.track).toHaveBeenCalledWith(
      AnalyticsEvent.CLI_STORYBOOK_BUILD_FAILED,
      expect.objectContaining({
        errorCategory: 'storybook_build_failed',
        cliVersion: '1.0.0',
        storybookVersion: '8.0.0',
        ciService: 'github-actions',
        gitUserEmailHash: expect.any(String),
      })
    );
  });

  it('reports analytics throws via ports.errors and still throws the build failure', async () => {
    const analyticsError = new Error('analytics exploded');
    const builder = { build: vi.fn().mockRejectedValueOnce(new Error('build failed')) };
    const { log, ports } = makeFakes({
      builder,
      analytics: {
        track: vi.fn(() => {
          throw analyticsError;
        }),
        flush: vi.fn(async () => undefined),
      },
    });

    const thrown = await runBuildPhase({
      options: { buildScriptName: 'build:storybook' } as Options,
      env: baseEnvironment,
      storybook: { version: '7.0.0' },
      git: {} as any,
      packageJson: {},
      pkg: basePackage,
      log,
      ports,
    }).catch((error) => error);

    expect(thrown).toBeInstanceOf(BuildPhaseError);
    expect(thrown).not.toBe(analyticsError);
    expect(ports.errors.captureException).toHaveBeenCalledWith(analyticsError);
  });
});
