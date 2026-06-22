import { existsSync as existsSyncDefault } from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyBuildOutput, buildProject, extractBuildInput } from './index';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => false),
  };
});

vi.mock('./setSourceDirectory', () => ({
  setSourceDirectory: vi.fn(async () => '/sourceDir'),
}));
vi.mock('./setBuildCommand', () => ({
  setBuildCommand: vi.fn(async () => 'build-command'),
}));
vi.mock('./buildStorybook', () => ({
  buildStorybook: vi.fn(async () => ({ buildLogFile: '/build.log' })),
}));
vi.mock('./buildReactNative', () => ({
  buildArtifacts: vi.fn(async () => ({ reactNativeBuildLogFile: '/rn-build.log' })),
  generateManifestStep: vi.fn(async () => {}),
}));

const { buildArtifacts, generateManifestStep } = await import('./buildReactNative');
const existsSync = vi.mocked(existsSyncDefault);

const makeDeps = (options: Record<string, any> = {}) =>
  ({
    options,
    log: { debug: vi.fn(), warn: vi.fn() },
    env: {},
    report: vi.fn(),
  }) as any;

const baseInput = { isReactNativeApp: false, flags: {}, git: {} } as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildProject (web)', () => {
  it('skips with prebuilt artifacts when storybookBuildDir is set', async () => {
    const result = await buildProject(makeDeps({ storybookBuildDir: '/prebuilt' }), baseInput);
    expect(result).toEqual({
      kind: 'continue',
      output: { sourceDir: '/prebuilt', skippedWithPrebuilt: true },
    });
  });

  it('builds the Storybook when no prebuilt dir is provided', async () => {
    const deps = makeDeps({});
    const result = await buildProject(deps, baseInput);
    expect(result).toEqual({
      kind: 'continue',
      output: {
        sourceDir: '/sourceDir',
        skippedWithPrebuilt: false,
        buildCommand: 'build-command',
        buildLogFile: '/build.log',
      },
    });
    expect(deps.report).toHaveBeenCalledWith({ output: 'Running command: build-command' });
  });
});

describe('buildProject (react native)', () => {
  const rnInput = { ...baseInput, isReactNativeApp: true };

  it('skips when prebuilt dir contains a manifest', async () => {
    existsSync.mockReturnValueOnce(true);
    const result = await buildProject(makeDeps({ storybookBuildDir: '/prebuilt' }), rnInput);
    expect(buildArtifacts).not.toHaveBeenCalled();
    expect(generateManifestStep).not.toHaveBeenCalled();
    expect(result).toEqual({
      kind: 'continue',
      output: { sourceDir: '/prebuilt', skippedWithPrebuilt: true },
    });
  });

  it('generates only the manifest when prebuilt dir lacks a manifest', async () => {
    existsSync.mockReturnValueOnce(false);
    const result = await buildProject(makeDeps({ storybookBuildDir: '/prebuilt' }), rnInput);
    expect(buildArtifacts).not.toHaveBeenCalled();
    expect(generateManifestStep).toHaveBeenCalled();
    expect(result).toMatchObject({
      output: {
        sourceDir: '/sourceDir',
        skippedWithPrebuilt: false,
        reactNativeBuildLogFile: undefined,
      },
    });
  });

  it('builds artifacts and the manifest when no prebuilt dir is provided', async () => {
    const result = await buildProject(makeDeps({}), rnInput);
    expect(buildArtifacts).toHaveBeenCalled();
    expect(generateManifestStep).toHaveBeenCalled();
    expect(result).toMatchObject({
      output: {
        sourceDir: '/sourceDir',
        skippedWithPrebuilt: false,
        reactNativeBuildLogFile: '/rn-build.log',
      },
    });
  });
});

describe('extractBuildInput', () => {
  it('reads build-relevant fields off the context', () => {
    const ctx = {
      isReactNativeApp: true,
      sourceDir: '/src',
      storybook: { version: '7' },
      flags: { buildCommand: 'x' },
      git: { changedFiles: ['a.js'] },
      announcedBuild: { browsers: ['ios'] },
      runtimeMetadata: { nodePlatform: 'darwin' },
    } as any;
    expect(extractBuildInput(ctx)).toEqual({
      isReactNativeApp: true,
      sourceDir: '/src',
      storybook: { version: '7' },
      flags: { buildCommand: 'x' },
      browsers: ['ios'],
      runtimeMetadata: { nodePlatform: 'darwin' },
      git: { changedFiles: ['a.js'] },
    });
  });
});

describe('applyBuildOutput', () => {
  it('writes build artifacts to the context', () => {
    const ctx = {} as any;
    applyBuildOutput(ctx, {
      sourceDir: '/src',
      skippedWithPrebuilt: false, // not set on ctx
      buildCommand: 'cmd',
      buildLogFile: '/log',
    });
    expect(ctx).toMatchObject({ sourceDir: '/src', buildCommand: 'cmd', buildLogFile: '/log' });
  });

  it('writes the React Native build log when present', () => {
    const ctx = {} as any;
    applyBuildOutput(ctx, {
      sourceDir: '/src',
      skippedWithPrebuilt: false, // not set on ctx
      reactNativeBuildLogFile: '/rn.log',
    });
    expect(ctx).toMatchObject({ sourceDir: '/src', reactNativeBuildLogFile: '/rn.log' });
  });
});
