import { afterEach, describe, expect, it, vi } from 'vitest';

import { exitCodes } from '../lib/setExitCode';
import * as phaseModule from '../run/phases/build';
import { BuildPhaseError } from '../run/phases/build';
import buildTask, { generateManifestForReactNative, runBuild } from './build';

vi.mock('../run/phases/build', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../run/phases/build')>();
  return { ...actual, runBuildPhase: vi.fn() };
});
vi.mock('../lib/react-native/generateManifest', () => ({
  generateManifest: vi.fn(async () => undefined),
}));

const runBuildPhase = vi.mocked(phaseModule.runBuildPhase);

afterEach(() => {
  vi.clearAllMocks();
});

function makeContext(overrides: Record<string, unknown> = {}): any {
  return {
    options: {},
    flags: {},
    env: {},
    git: {},
    packageJson: {},
    pkg: { version: '1.0.0' },
    ports: {
      fs: { exists: vi.fn(async () => false) },
    },
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  };
}

describe('runBuild', () => {
  it('mirrors phase artifacts onto context', async () => {
    runBuildPhase.mockResolvedValue({
      sourceDir: '/tmp/sb',
      buildCommand: 'npm run build',
      buildLogFile: '/tmp/build.log',
    });
    const ctx = makeContext();
    await runBuild(ctx);
    expect(ctx.sourceDir).toBe('/tmp/sb');
    expect(ctx.buildCommand).toBe('npm run build');
    expect(ctx.buildLogFile).toBe('/tmp/build.log');
  });

  it('skips when ctx.skip is set', async () => {
    runBuildPhase.mockResolvedValue({ sourceDir: 'unused' });
    const ctx = makeContext({ skip: true });
    await runBuild(ctx);
    expect(runBuildPhase).not.toHaveBeenCalled();
  });

  it('translates BuildPhaseError into setExitCode + a wrapped throw', async () => {
    runBuildPhase.mockRejectedValueOnce(
      new BuildPhaseError('build failed', exitCodes.NPM_BUILD_STORYBOOK_FAILED)
    );
    const ctx = makeContext();
    await expect(runBuild(ctx)).rejects.toThrow();
    expect(ctx.exitCode).toBe(exitCodes.NPM_BUILD_STORYBOOK_FAILED);
    expect(ctx.userError).toBe(true);
  });

  it('rethrows non-BuildPhaseError unchanged', async () => {
    const original = new Error('weird');
    runBuildPhase.mockRejectedValueOnce(original);
    const ctx = makeContext();
    await expect(runBuild(ctx)).rejects.toBe(original);
  });
});

describe('generateManifestForReactNative', () => {
  it('runs only for React Native apps', async () => {
    const generateManifestModule = await import('../lib/react-native/generateManifest');
    const ctx = makeContext({ isReactNativeApp: true });
    await generateManifestForReactNative(ctx);
    expect(generateManifestModule.generateManifest).toHaveBeenCalledWith(ctx);
  });

  it('is a no-op for non-RN apps', async () => {
    const generateManifestModule = await import('../lib/react-native/generateManifest');
    const ctx = makeContext({ isReactNativeApp: false });
    await generateManifestForReactNative(ctx);
    expect(generateManifestModule.generateManifest).not.toHaveBeenCalled();
  });
});

describe('build task skip()', () => {
  it('throws and sets exit code when RN app is missing storybookBuildDir', async () => {
    const ctx = makeContext({
      isReactNativeApp: true,
      announcedBuild: { browsers: [] },
    });
    const task = buildTask(ctx);
    await expect(task.skip?.(ctx)).rejects.toThrow();
    expect(ctx.exitCode).toBe(exitCodes.INVALID_OPTIONS);
  });

  it('returns the skipped string when --storybook-build-dir is supplied (non-RN)', async () => {
    const ctx = makeContext({
      options: { storybookBuildDir: '/path/to/build' },
    });
    const task = buildTask(ctx);
    const result = await task.skip?.(ctx);
    expect(typeof result).toBe('string');
    expect(ctx.sourceDir).toBe('/path/to/build');
  });
});
